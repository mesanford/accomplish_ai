"""A leader corrects a Scout's birth month and year, for example for a Scout added before they were asked for.

The birth date decides whether only a parent can consent for the Scout (under 13, or age unknown), so a change must
never get around that:
- A Scout waiting for parent consent can't be changed. Making them older would lift the hold without a parent.
- If the new date means the Scout may be under 13 and no parent has consented, the Scout is put on hold at once.
- A Scout with their own login must be 13 or older, so a date that may make them younger is refused.
"""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import db, fail, require_leader, troop, troop_today
from handlers.consent_kinds import HOLD_MESSAGE, is_held
from handlers.consent_requests import needs_parent_consent
from handlers.membership import InvalidInput, parse_birth, under_13

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
HAS_LOGIN = "This Scout has their own login, so they must be 13 or older. Check the birth month and year."


@https_fn.on_call()
def set_scout_birth(req: https_fn.CallableRequest) -> dict:
    """Set `birthYear` and `birthMonth` on a Scout's record. Returns whether the Scout now waits for parent consent."""
    data = req.data or {}
    troop_id, scout_id = data.get("troopId"), data.get("scoutId")
    require_leader(req, troop_id)
    if not isinstance(scout_id, str) or not scout_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout.")
    today = troop_today(troop_id)
    try:
        year, month = parse_birth(data, today)
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    birth = {"birthYear": year, "birthMonth": month}
    t = troop(troop_id)
    member_ref = t.collection("members").document(scout_id)

    @firestore.transactional
    def change(tx) -> bool:
        member = member_ref.get(transaction=tx).to_dict()
        if member is None or member.get("kind") != "scout":
            raise LookupError
        if is_held(member):
            raise InvalidInput(HOLD_MESSAGE)
        if member.get("uid") and under_13(birth, today):
            raise InvalidInput(HAS_LOGIN)
        consent = t.collection("consents").document(scout_id).get(transaction=tx).to_dict() or {}
        hold = not consent.get("parentConsents") and needs_parent_consent(birth, today)
        tx.set(t.collection("scoutRecords").document(scout_id), birth, merge=True)
        if hold:
            tx.update(member_ref, {"consentHold": True})
        return hold

    try:
        hold = change(db().transaction())
    except LookupError as err:
        raise fail(Code.NOT_FOUND, "That Scout isn't on the roster.") from err
    except InvalidInput as err:
        raise fail(Code.FAILED_PRECONDITION, str(err)) from err
    log.info("scout birth set troop=%s held=%s", troop_id, hold)
    return {"held": hold}
