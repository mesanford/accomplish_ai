"""Shared pieces for the sign-up callables: reading an event's sign-ups and moving people off the waitlist."""

from __future__ import annotations

from datetime import UTC, datetime

from firebase_functions import https_fn

from fb import fail
from handlers.signups import SignupError, after_promotion, counts, promote, read_config, status_of

Code = https_fn.FunctionsErrorCode


def refs(t, event_id: str) -> dict:
    event = t.collection("events").document(event_id)
    return {
        "event": event,
        "signups": event.collection("signups"),
        "notes": event.collection("signupNotes"),
        "fees": event.collection("feeStatus"),
    }


def args(req) -> tuple[str, str, str]:
    data = req.data or {}
    troop_id, event_id, member_id = data.get("troopId"), data.get("eventId"), data.get("memberId")
    if not all(isinstance(v, str) and v for v in (troop_id, event_id, member_id)):
        raise fail(Code.INVALID_ARGUMENT, "Choose an event and a person.")
    return troop_id, event_id, member_id


def bad(err: SignupError):
    return fail(Code.FAILED_PRECONDITION, str(err))


def read_all(tx, r: dict) -> tuple[dict, dict[str, dict]]:
    """(event doc, {memberId: signup}) read inside a transaction. Raises if the event is missing."""
    snap = r["event"].get(transaction=tx)
    if not snap.exists:
        raise fail(Code.NOT_FOUND, "That event was not found.")
    return snap.to_dict() or {}, {d.id: d.to_dict() for d in r["signups"].stream(transaction=tx)}


def write_promotions(tx, r: dict, event: dict, signups: dict[str, dict]) -> list[str]:
    """Move people off the waitlist while there is room, save the new counts, and return who moved.

    Call after every read in the transaction. `signups` is updated in place.
    """
    config = read_config(event)
    moved = promote(signups, config["capacity"] if config else None) if config else []
    now = datetime.now(UTC)
    for member_id in moved:
        signups[member_id] = after_promotion(signups[member_id])
        tx.update(
            r["signups"].document(member_id),
            {"spot": "held", "status": status_of(signups[member_id]), "promotedAt": now},
        )
    tx.update(r["event"], {"signupCounts": counts(signups)})
    return moved
