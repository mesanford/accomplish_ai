"""Adding Scouts to the roster."""

from __future__ import annotations

from datetime import UTC, date, datetime

from firebase_functions import https_fn

from endpoints.consent import send_consent_confirmation, stage_leader_confirmation, stage_parent_consent
from endpoints.parent_links import stage_link, stage_roles
from fb import db, fail, is_leader, require_access, troop
from handlers.consent import (
    check_leader_confirmation,
    check_parent_consent,
    leader_confirmation_entry,
    parent_consent_entry,
)
from handlers.membership import InvalidInput, new_scout
from handlers.roles import in_order

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT


@https_fn.on_call()
def add_scout(req: https_fn.CallableRequest) -> dict:
    """Leaders add Scouts to the roster; parents add their own children, who are linked to them.

    A leader who is also a parent ticks "This is my child" (`isMyChild`). The Scout is then linked to them,
    they become a parent in this troop, and they agree to the parent notice. Without it nothing links.
    """
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    roles = set(access.get("roles", []))
    if not roles & {"leader", "advancement", "parent"}:
        raise fail(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "Only leaders and parents can add Scouts.")
    try:
        member, record = new_scout(data, date.today())
    except (InvalidInput, ValueError) as err:
        raise fail(BAD, str(err)) from err
    t = troop(troop_id)
    member_ref = t.collection("members").document()
    is_parent = data.get("isMyChild") is True if is_leader(access) else "parent" in roles
    now = datetime.now(UTC)
    try:
        if is_parent:
            check_parent_consent(data)  # a parent adding their child agrees to the same notice
        confirmed = not is_parent and check_leader_confirmation(data, record, now.date())
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    uid, parent_id = req.auth.uid, access["memberId"]
    if is_parent:
        member["guardianIds"] = [parent_id]
    batch = db().batch()
    batch.set(member_ref, member)
    batch.set(t.collection("scoutRecords").document(member_ref.id), record)
    consent = None
    if is_parent:
        consent = parent_consent_entry(uid, parent_id, now)
        stage_parent_consent(batch, t, [member_ref.id], consent)
        if "parent" not in roles:
            stage_roles(batch, t, troop_id, uid, parent_id, in_order(roles | {"parent"}))
        stage_link(batch, t, uid, parent_id, [member_ref.id])
    elif confirmed:
        entry = leader_confirmation_entry(uid, parent_id, now)
        stage_leader_confirmation(batch, t, member_ref.id, entry)
    batch.commit()
    if consent:
        send_consent_confirmation(troop_id, [member_ref.id], consent)
    return {"scoutId": member_ref.id}
