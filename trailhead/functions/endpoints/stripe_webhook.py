"""`stripe_webhook`: Stripe tells Forthright that a card payment went through, failed, was refunded or disputed.

A Connect webhook endpoint (events from troops' connected accounts), signed with STRIPE_WEBHOOK_SECRET. A paid
Checkout Session posts one ledger payment (method "card") through the same transactional `post` as record_payment,
exactly once: the payment record is read inside that transaction and holds the ledger entry id once posted. A refund
posts a reversal with reason "Card refund". Disputes are kept on the payment record for the treasurer.

Events are applied whatever PAYMENTS_MODE is now: a payment started before payments were turned off still gets
recorded. Each record keeps the mode it was made in, and an event's livemode must match it.

Answers: 400 for a bad signature, 500 to have Stripe retry (an error, or a refund that arrived before its payment),
200 for everything else, including events that are not Forthright's.
"""

from __future__ import annotations

import json
import logging
import os
import time

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.money import post
from endpoints.payment_records import LOOKUP  # payment intent id -> {troopId, paymentId}, for refunds and disputes
from endpoints.payments import sync_account
from fb import db, troop
from handlers.ledger import ADJUSTMENT, compute_account
from handlers.membership import InvalidInput
from handlers.payment_events import Action, dispute_fields, read_event, session_problem, status_update
from handlers.payments import PAID, PARTIAL, REFUNDED, REVIEW, card_payment_entry, refund_entries
from handlers.stripe_wire import BadSignature, verify

log = logging.getLogger(__name__)


class Retry(Exception):
    """Not ready yet (for example a refund delivered before its payment). Stripe will send it again."""


def _record_ref(troop_id, payment_id):
    if not isinstance(troop_id, str) or not isinstance(payment_id, str) or not troop_id or not payment_id:
        return None
    if "/" in troop_id or "/" in payment_id:
        return None
    return troop(troop_id).collection("payments").document(payment_id)


def _review(ref, why: str) -> str:
    log.error("stripe webhook needs review: %s", why)
    ref.update({"status": REVIEW, "reviewReason": why, "updatedAt": firestore.SERVER_TIMESTAMP})
    return f"review:{why}"


def _wrong_source(record: dict, action: Action) -> str | None:
    if action.account != record.get("stripeAccountId"):
        return "account"
    if action.livemode != (record.get("mode") == "live"):
        return "mode"
    return None


def credit(action: Action) -> str:
    """Post the card payment for a paid session, once."""
    ref = _record_ref(action.troop_id, action.payment_id)
    record = ref.get().to_dict() if ref else None
    if record is None:
        return "not-ours"
    if record.get("ledgerEntryId"):
        return "already"
    problem = session_problem(record, action)
    if problem:
        return _review(ref, problem)
    scout_id, outcome = record["scoutId"], {}

    def build(tx, settings, entries):
        outcome.clear()  # a retried transaction starts over
        current = ref.get(transaction=tx).to_dict() or {}
        if current.get("ledgerEntryId"):
            outcome["already"] = True
            return []
        state = compute_account(entries[scout_id])
        return [card_payment_entry(entries[scout_id], state, current, ref.id)]

    def after(tx, written):
        if not written:
            return
        entry_id, entry = written[0]
        covered = sum(entry["covers"].values())
        tx.update(
            ref,
            {
                "status": PAID,
                "ledgerEntryId": entry_id,
                "paymentIntentId": action.payment_intent,
                "coveredCents": covered,
                "creditCents": entry["amountCents"] - covered,
                "paidAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
        )
        if action.payment_intent:
            lookup = db().collection(LOOKUP).document(action.payment_intent)
            tx.set(lookup, {"troopId": action.troop_id, "paymentId": ref.id})

    post(action.troop_id, [scout_id], build, None, None, after)
    return "already" if outcome.get("already") else "posted"


def _locate(action: Action):
    """The payment record a refund or dispute is about, or None when the charge isn't one Forthright started."""
    found = {}
    if action.payment_intent:
        found = db().collection(LOOKUP).document(action.payment_intent).get().to_dict() or {}
    troop_id = found.get("troopId") or action.troop_id
    payment_id = found.get("paymentId") or action.payment_id
    return _record_ref(troop_id, payment_id), troop_id


def refund(action: Action) -> str:
    ref, troop_id = _locate(action)
    record = ref.get().to_dict() if ref else None
    if record is None:
        return "not-ours"
    wrong = _wrong_source(record, action)
    if wrong:
        return _review(ref, wrong)
    if not record.get("ledgerEntryId"):
        raise Retry("refund arrived before its payment was recorded")
    scout_id, outcome = record["scoutId"], {}

    def build(tx, settings, entries):
        outcome.clear()  # a retried transaction starts over
        current = ref.get(transaction=tx).to_dict() or {}
        try:
            new, done = refund_entries(entries[scout_id], current, ref.id, action.refunded)
        except InvalidInput as err:  # the treasurer already reversed the payment by hand
            outcome["review"] = str(err)
            return []
        outcome.update(done=done, record=current, posted=bool(new))
        return new

    def after(tx, written):
        if outcome.get("review"):
            fields = {"status": REVIEW, "reviewReason": "refund", "refundedCents": action.refunded}
            tx.update(ref, {**fields, "updatedAt": firestore.SERVER_TIMESTAMP})
            return
        if not written:
            return
        current = outcome["record"]
        partial_ids = [i for i, e in written if e["type"] == ADJUSTMENT and not e.get("reverses")]
        full = outcome["done"] >= int(current["amountCents"])
        fields = {
            "status": REFUNDED if full else PARTIAL,
            "refundedCents": action.refunded,
            "refundedLedgerCents": outcome["done"],
            "refundEntryIds": [*(current.get("refundEntryIds") or []), *partial_ids],
        }
        tx.update(ref, {**fields, "updatedAt": firestore.SERVER_TIMESTAMP})

    post(troop_id, [scout_id], build, None, None, after)
    if outcome.get("review"):
        return "review"
    return "posted" if outcome.get("posted") else "already"


def simple(action: Action) -> str:
    """Session failed, expired or still processing; or a dispute. No ledger change."""
    if action.kind == "dispute":
        ref, _ = _locate(action)
    else:
        ref = _record_ref(action.troop_id, action.payment_id)
    record = ref.get().to_dict() if ref else None
    if record is None:
        return "not-ours"
    wrong = _wrong_source(record, action)
    if wrong:
        return _review(ref, wrong)
    fields = dispute_fields(record, action) if action.kind == "dispute" else status_update(record, action)
    if not fields:
        return "unchanged"
    if action.kind == "dispute":
        log.warning("card payment disputed status=%s", action.details.get("status"))
    ref.update({**fields, "updatedAt": firestore.SERVER_TIMESTAMP})
    return "updated"


HANDLERS = {"paid": credit, "refund": refund, "account": sync_account, "deauthorized": sync_account}


def handle(event: dict) -> str:
    action = read_event(event)
    if action.kind == "ignore":
        return "ignored"
    return HANDLERS.get(action.kind, simple)(action)


@https_fn.on_request(secrets=["STRIPE_WEBHOOK_SECRET"], memory=256, timeout_sec=60)
def stripe_webhook(req: https_fn.Request) -> https_fn.Response:
    if req.method != "POST":
        return https_fn.Response("Method not allowed", status=405)
    payload = req.get_data()
    try:
        verify(payload, req.headers.get("Stripe-Signature"), os.environ.get("STRIPE_WEBHOOK_SECRET"), int(time.time()))
        event = json.loads(payload)
    except (BadSignature, ValueError) as err:
        log.warning("stripe webhook refused: %s", err if isinstance(err, BadSignature) else "not JSON")
        return https_fn.Response("Bad signature", status=400)
    try:
        outcome = handle(event)
    except Retry as err:
        log.info("stripe webhook will retry: %s", err)
        return https_fn.Response("Retry later", status=500)
    except Exception:
        log.exception("stripe webhook failed type=%s", event.get("type"))
        return https_fn.Response("Error", status=500)
    log.info("stripe webhook type=%s outcome=%s", event.get("type"), outcome)
    body = json.dumps({"received": True, "outcome": outcome})
    return https_fn.Response(body, status=200, mimetype="application/json")
