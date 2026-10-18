"""Record the date of a person's BSA health form (Parts A and B, or Part C). Dates only, never medical details.

The server stamps who recorded the date and when, so a client can't claim another person or a different time.
Leaders can record for anyone; a person for themselves; a Scout's linked parent for the Scout.
"""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import fail, refuse_if_blocked, require_access, troop
from handlers.health_forms import can_record, entry, parse_record
from handlers.membership import InvalidInput
from handlers.retention import today_local

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


@https_fn.on_call()
def record_health_form(req: https_fn.CallableRequest) -> dict:
    """Save one date: `{troopId, memberId, part: "partsAB" or "partC", date}`. Replaces the earlier date."""
    data = req.data or {}
    troop_id, member_id = data.get("troopId"), data.get("memberId")
    access = require_access(req, troop_id)
    if not isinstance(member_id, str) or not member_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose a person.")
    if not can_record(access, member_id):
        raise fail(Code.PERMISSION_DENIED, "You can only record health form dates for yourself or your own Scouts.")
    try:
        part, day = parse_record(data, today_local())
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    t = troop(troop_id)
    member = t.collection("members").document(member_id).get().to_dict()
    if member is None or member.get("leftAt"):
        raise fail(Code.NOT_FOUND, "That person isn't on the roster.")
    if member.get("kind") == "scout":
        refuse_if_blocked(t, member_id, "healthForms")  # waits for a parent to agree to the notice that covers it
    ref = t.collection("healthForms").document(member_id)
    ref.set({part: entry(day, access["memberId"], firestore.SERVER_TIMESTAMP)}, merge=True)
    log.info("health form date recorded part=%s", part)  # never the person's name or the date
    return {"recorded": True, "part": part, "date": day}
