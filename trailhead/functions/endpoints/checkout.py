"""A parent pays a Scout's open charges by card: Stripe-hosted Checkout on the troop's own Stripe account.

Card details go only to Stripe. The server works out the amount from the ledger, starts a Checkout Session as a direct
charge on the troop's connected account and keeps a payment record. The webhook (`stripe_webhook`) posts the ledger
payment once Stripe says the money moved.
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, date, datetime, timedelta

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.payments import SECRETS, app_base, connection, require_on
from endpoints.stripe_api import Stripe, StripeError, in_emulator
from fb import db, fail, refuse_if_blocked, require_access, troop
from handlers import payments as pay
from handlers.account_settings import settings_of
from handlers.ledger import compute_account
from handlers.membership import InvalidInput
from handlers.payment_events import UNFINISHED
from handlers.retention import today_local
from handlers.roles import acts_for
from handlers.signup_config import troop_zone

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
SESSION_MINUTES = 31  # Stripe needs at least 30 minutes; a short life keeps a stale page from charging old amounts
CHECKOUT_HOST = "https://checkout.stripe.com/"
STARTING_GRACE = timedelta(minutes=5)  # longer than create_checkout can run; an older "starting" record was abandoned
BUSY = "A payment for these charges is already going through. Reload the page in a minute."


def _count_session(t, uid: str, today: date) -> None:
    """At most DAILY_SESSIONS checkouts started per person per day (server-only `usage/pay_{uid}_{date}`)."""
    ref = t.collection("usage").document(f"pay_{uid}_{today.isoformat()}")

    @firestore.transactional
    def bump(tx) -> bool:
        snap = ref.get(transaction=tx)
        count = (snap.to_dict() or {}).get("count", 0) if snap.exists else 0
        if count >= pay.DAILY_SESSIONS:
            return False
        tx.set(ref, {"uid": uid, "date": today.isoformat(), "count": count + 1, "kind": "payments"})
        return True

    if not bump(db().transaction()):
        raise fail(Code.RESOURCE_EXHAUSTED, "You've started a lot of payments today. Try again tomorrow.")


def _session_expired(stripe: Stripe, old: dict, account: str) -> bool:
    """Whether Stripe already ended a session on its own (it refuses to expire one that isn't open)."""
    try:
        found = stripe.get(f"/v1/checkout/sessions/{old['sessionId']}", account=old.get("stripeAccountId") or account)
    except StripeError:
        return False
    return found.get("status") == "expired"


def _end_unfinished(t, stripe: Stripe, account: str, scout_id: str, mine: str) -> None:
    """One unfinished checkout per Scout: end any earlier open one, so two payment pages can't both pay the same
    charges. A payment still settling (a bank debit, say) or another checkout still starting means refuse.

    Runs after this checkout's own "starting" record is written, so of two checkouts started at once at least one
    sees the other and refuses. Every reason to refuse is checked before anything is ended, so a refused checkout
    never closes the family's earlier payment page."""
    now = datetime.now(UTC)
    query = t.collection("payments").where("scoutId", "==", scout_id).where("status", "in", list(UNFINISHED))
    others = [(snap, snap.to_dict() or {}) for snap in query.stream() if snap.id != mine]

    def unstarted(old: dict) -> bool:
        return old.get("status") == "starting" or not old.get("sessionId")

    for _, old in others:
        if old.get("status") == pay.PROCESSING:
            raise fail(Code.FAILED_PRECONDITION, BUSY)
        created = old.get("createdAt")
        if unstarted(old) and isinstance(created, datetime) and now - created < STARTING_GRACE:
            raise fail(Code.FAILED_PRECONDITION, BUSY)
    for snap, old in others:
        if unstarted(old):  # abandoned: no Stripe session to end
            snap.reference.update({"status": pay.EXPIRED, "updatedAt": firestore.SERVER_TIMESTAMP})
            continue
        try:
            path = f"/v1/checkout/sessions/{old['sessionId']}/expire"
            stripe.post(path, {}, idem=f"expire-{snap.id}", account=old.get("stripeAccountId") or account)
        except StripeError:
            # Either it already went through (let the webhook catch up) or it expired and that event hasn't come.
            if not _session_expired(stripe, old, account):
                raise fail(Code.FAILED_PRECONDITION, BUSY) from None
        snap.reference.update({"status": pay.EXPIRED, "updatedAt": firestore.SERVER_TIMESTAMP})


def _check_payer(req: https_fn.CallableRequest, troop_id, scout_id) -> dict:
    access = require_access(req, troop_id)
    if not isinstance(scout_id, str) or not scout_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout.")
    # A parent linked to this Scout who has agreed to the consent notice for them (acts_for checks both).
    if "parent" not in access.get("roles", []) or not acts_for(access, scout_id):
        raise fail(Code.PERMISSION_DENIED, "Only a parent of this Scout can pay online.")
    return access


@https_fn.on_call(secrets=SECRETS)
def create_checkout(req: https_fn.CallableRequest) -> dict:
    """{troopId, scoutId, chargeIds} or {troopId, scoutId, amountCents} -> {url, paymentId}. Never trusts a price."""
    data = req.data or {}
    troop_id, scout_id = data.get("troopId"), data.get("scoutId")
    _check_payer(req, troop_id, scout_id)
    cfg = require_on()
    t = troop(troop_id)
    troop_doc = t.get().to_dict() or {}
    today = today_local(zone=troop_zone(troop_doc))
    linked = connection(troop_doc, cfg)
    if not linked.get("chargesEnabled"):
        raise fail(Code.FAILED_PRECONDITION, "The troop hasn't finished setting up online payments.")
    member = t.collection("members").document(scout_id).get().to_dict()
    if not member or member.get("kind") != "scout":
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout in this troop.")
    refuse_if_blocked(t, scout_id, "accounts")
    entries = {d.id: d.to_dict() for d in t.collection("ledger").where("scoutId", "==", scout_id).stream()}
    settings = settings_of(troop_doc)
    try:
        charge_ids, amount = pay.checkout_amount(compute_account(entries), data, settings["allowPrepay"])
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    _count_session(t, req.auth.uid, today)

    account = linked["stripeAccountId"]
    stripe = Stripe(cfg)
    fee = pay.fee_for(amount, settings["cardFee"])
    ref = t.collection("payments").document()
    record = {
        "scoutId": scout_id,
        "chargeIds": charge_ids,
        "amountCents": amount,
        "feeCents": fee,
        "totalCents": amount + fee,
        "platformFeeCents": pay.PLATFORM_FEE_CENTS,
        "description": pay.description(troop_doc, charge_ids),
        "status": "starting",
        "stripeAccountId": account,
        "mode": cfg.mode,
        "createdBy": req.auth.uid,
        "date": today.isoformat(),
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    ref.set(record)
    try:
        _end_unfinished(t, stripe, account, scout_id, ref.id)
    except Exception:
        ref.delete()  # a leftover "starting" record would block this Scout's checkouts for STARTING_GRACE
        raise
    back = f"{app_base(data)}/t/{troop_id}/scouts/{scout_id}"
    urls = {"success": f"{back}?payment=done&ref={ref.id}", "cancel": f"{back}?payment=cancelled&ref={ref.id}"}
    expires = int(time.time()) + SESSION_MINUTES * 60
    try:
        params = pay.session_params(record, ref.id, troop_id, urls, expires)
        session = stripe.post("/v1/checkout/sessions", params, idem=f"checkout-{ref.id}", account=account)
    except StripeError:
        ref.delete()  # nothing was charged; keep no record of a checkout that never started
        raise fail(Code.UNAVAILABLE, "Stripe didn't answer. Nothing was charged. Try again in a minute.") from None
    url = str(session.get("url") or "")
    if not url.startswith(CHECKOUT_HOST) and not in_emulator():
        log.error("checkout url was not on Stripe troop=%s", troop_id)
        ref.delete()
        raise fail(Code.INTERNAL, "The payment page could not be opened. Nothing was charged.")
    ref.update({"status": pay.OPEN, "sessionId": session.get("id"), "expiresAt": expires})
    log.info("checkout started troop=%s mode=%s charges=%d fee=%s", troop_id, cfg.mode, len(charge_ids), bool(fee))
    return {"url": url, "paymentId": ref.id}
