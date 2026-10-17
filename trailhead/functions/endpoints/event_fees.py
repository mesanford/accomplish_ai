"""Charging an event fee to the Scouts who are going or who came. Each Scout is charged at most once per event."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_functions import https_fn

from endpoints.signup_core import Code, refs
from fb import fail, require_leader, troop
from handlers import signups as rules
from handlers.event_fees import FeeError, fee_cents, post_fees, scouts_to_charge
from trailhead_core.dates import human

log = logging.getLogger(__name__)
CLAIMED = ("posting", "posted", "pending")  # a Scout in any of these states is never charged again


@https_fn.on_call()
def charge_event_fees(req: https_fn.CallableRequest) -> dict:
    """Leaders: "Charge going Scouts" (who = "going") or "Charge attendees" (who = "attendees").

    INTEGRATION SEAM: `post_fees` (handlers/event_fees.py) calls the accounts helper `post_charges` when it exists.
    Until then the charge is kept as pending: `feeStatus/{scoutId}` says "pending" and the event gets `feesPending`.
    """
    data = req.data or {}
    troop_id, event_id = data.get("troopId"), data.get("eventId")
    require_leader(req, troop_id)
    if not isinstance(event_id, str) or not event_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose an event.")
    t = troop(troop_id)
    r = refs(t, event_id)
    event = r["event"].get().to_dict()
    if event is None:
        raise fail(Code.NOT_FOUND, "That event was not found.")
    amount = fee_cents(event)
    if not amount:
        raise fail(Code.FAILED_PRECONDITION, "This event has no fee.")
    signups = {d.id: d.to_dict() for d in r["signups"].stream()}
    attendance = {d.id: bool((d.to_dict() or {}).get("present")) for d in r["event"].collection("attendance").stream()}
    members = {d.id: d.to_dict() or {} for d in t.collection("members").stream()}
    charged = {d.id for d in r["fees"].stream() if (d.to_dict() or {}).get("state") in CLAIMED}
    try:
        ids = [i for i in scouts_to_charge(data.get("who"), signups, attendance, members) if i not in charged]
    except FeeError as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from None
    if not ids:
        return {"charged": 0, "state": None}

    now = datetime.now(UTC)
    for i in ids:  # claim first, so a retry can never charge the same Scout twice
        r["fees"].document(i).set({"state": "posting", "amountCents": amount, "at": now, "byUid": req.auth.uid})
    description = f"{event.get('title', 'Event')} ({human(rules.as_date(event.get('start')) or now.date())})"
    try:
        state = post_fees(troop_id, ids, amount, description, event_id, req.auth.uid)
    except Exception:
        for i in ids:
            r["fees"].document(i).delete()
        log.exception("charging event fees failed")
        raise fail(Code.INTERNAL, "The fees could not be charged. Nothing was charged. Try again.") from None
    for i in ids:
        r["fees"].document(i).update({"state": state})
    key = "feesPending" if state == "pending" else "feesPosted"
    total = ((event.get(key) or {}).get("count") or 0) + len(ids)
    r["event"].update({key: {"count": total, "amountCents": amount, "at": now}})
    log.info("event fees troop=%s event=%s state=%s count=%d", troop_id, event_id, state, len(ids))
    return {"charged": len(ids), "state": state}
