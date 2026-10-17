"""Stripe webhook events: what each one means for a payment record. No Firestore here.

`read_event` turns a verified event into an `Action`. The webhook then applies it; every step is safe to repeat,
because Stripe may deliver an event more than once and in any order.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from handlers.payments import EXPIRED, FAILED, OPEN, PAID, PROCESSING

SESSION_EVENTS = {
    "checkout.session.completed": "session",
    "checkout.session.async_payment_succeeded": PAID,
    "checkout.session.async_payment_failed": FAILED,
    "checkout.session.expired": EXPIRED,
}
DISPUTE_EVENTS = ("charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed")
UNFINISHED = ("starting", OPEN, PROCESSING)


@dataclass
class Action:
    kind: str  # paid, processing, failed, expired, refund, dispute, account, deauthorized, ignore
    account: str | None = None  # the connected account the event came from
    livemode: bool = False
    troop_id: str | None = None
    payment_id: str | None = None
    session_id: str | None = None
    payment_intent: str | None = None
    amount_total: int | None = None
    currency: str | None = None
    refunded: int = 0
    details: dict = field(default_factory=dict)


def _intent_id(value) -> str | None:
    if isinstance(value, dict):
        value = value.get("id")
    return value if isinstance(value, str) and value else None


def read_event(event: dict) -> Action:
    kind, obj = event.get("type"), ((event.get("data") or {}).get("object") or {})
    base = {"account": event.get("account"), "livemode": event.get("livemode") is True}
    meta = obj.get("metadata") or {}
    ids = {"troop_id": meta.get("troopId"), "payment_id": meta.get("paymentId") or obj.get("client_reference_id")}
    if kind in SESSION_EVENTS:
        what = SESSION_EVENTS[kind]
        if what == "session":
            what = PAID if obj.get("payment_status") == "paid" else PROCESSING
        return Action(
            what,
            **base,
            **ids,
            session_id=obj.get("id"),
            payment_intent=_intent_id(obj.get("payment_intent")),
            amount_total=obj.get("amount_total"),
            currency=obj.get("currency"),
        )
    if kind == "charge.refunded":
        refunded = obj.get("amount_refunded")
        return Action(
            "refund",
            **base,
            **ids,
            payment_intent=_intent_id(obj.get("payment_intent")),
            refunded=refunded if isinstance(refunded, int) else 0,
            details={"chargeId": obj.get("id")},
        )
    if kind in DISPUTE_EVENTS:
        dispute = {
            "id": obj.get("id"),
            "status": obj.get("status"),
            "reason": obj.get("reason"),
            "amountCents": obj.get("amount") if isinstance(obj.get("amount"), int) else 0,
        }
        return Action("dispute", **base, **ids, payment_intent=_intent_id(obj.get("payment_intent")), details=dispute)
    if kind == "account.updated":
        fields = {
            "chargesEnabled": obj.get("charges_enabled") is True,
            "detailsSubmitted": obj.get("details_submitted") is True,
        }
        return Action("account", account=obj.get("id") or event.get("account"), details=fields)
    if kind == "account.application.deauthorized":
        return Action("deauthorized", **base)
    return Action("ignore", **base)


def session_problem(record: dict, action: Action) -> str | None:
    """Why a session event doesn't fit its payment record, or None. A mismatch is never credited."""
    if action.account != record.get("stripeAccountId"):
        return "account"
    if record.get("sessionId") and action.session_id != record.get("sessionId"):
        return "session"
    if action.livemode != (record.get("mode") == "live"):
        return "mode"
    if action.kind == PAID and (action.amount_total != record.get("totalCents") or action.currency != "usd"):
        return "amount"
    return None


def status_update(record: dict, action: Action) -> dict | None:
    """The new status for a session that did not (or not yet) pay. A paid record is never moved back."""
    if record.get("ledgerEntryId") or record.get("status") not in UNFINISHED:
        return None
    if record.get("status") == action.kind:
        return None
    return {"status": action.kind}


def dispute_fields(record: dict, action: Action) -> dict | None:
    """The dispute as the treasurer sees it. None when nothing changed."""
    current = record.get("dispute") or {}
    if all(current.get(k) == v for k, v in action.details.items()):
        return None
    return {"dispute": action.details}
