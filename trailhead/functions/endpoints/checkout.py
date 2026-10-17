"""A parent pays a Scout's open charges by card: Stripe-hosted Checkout on the troop's own Stripe account.

Card details go only to Stripe. The server works out the amount from the ledger, starts a Checkout Session as a direct
charge on the troop's connected account and keeps a payment record. The webhook (`stripe_webhook`) posts the ledger
payment once Stripe says the money moved.
"""

from __future__ import annotations

import logging
import time
from datetime import date

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.payments import SECRETS, app_base, connection, require_on
from endpoints.stripe_api import Stripe, StripeError, in_emulator
from fb import db, fail, require_access, troop
from handlers import payments as pay
from handlers.account_settings import settings_of
from handlers.ledger import compute_account
from handlers.membership import InvalidInput
from handlers.retention import today_local
from handlers.roles import acts_for

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
SESSION_MINUTES = 31  # Stripe needs at least 30 minutes; a short life keeps a stale page from charging old amounts
CHECKOUT_HOST = "https://checkout.stripe.com/"


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


def _expire_unfinished(t, stripe: Stripe, account: str, scout_id: str) -> None:
    """One unfinished checkout per Scout: end any earlier one first, so two open payment pages can't both pay the
    same charges. If Stripe says the earlier one already went through, refuse and let the webhook catch up."""
    query = t.collection("payments").where("scoutId", "==", scout_id).where("status", "==", pay.OPEN)
    for snap in query.stream():
        old = snap.to_dict() or {}
        if not old.get("sessionId"):
            continue
        try:
            path = f"/v1/checkout/sessions/{old['sessionId']}/expire"
            stripe.post(path, {}, idem=f"expire-{snap.id}", account=old.get("stripeAccountId") or account)
        except StripeError:
            raise fail(
                Code.FAILED_PRECONDITION,
                "A payment for these charges is already going through. Reload the page in a minute.",
            ) from None
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
    linked = connection(troop_doc, cfg)
    if not linked.get("chargesEnabled"):
        raise fail(Code.FAILED_PRECONDITION, "The troop hasn't finished setting up online payments.")
    member = t.collection("members").document(scout_id).get().to_dict()
    if not member or member.get("kind") != "scout":
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout in this troop.")
    entries = {d.id: d.to_dict() for d in t.collection("ledger").where("scoutId", "==", scout_id).stream()}
    settings = settings_of(troop_doc)
    try:
        charge_ids, amount = pay.checkout_amount(compute_account(entries), data, settings["allowPrepay"])
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    _count_session(t, req.auth.uid, today_local())

    account = linked["stripeAccountId"]
    stripe = Stripe(cfg)
    _expire_unfinished(t, stripe, account, scout_id)
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
        "date": today_local().isoformat(),
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    ref.set(record)
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
