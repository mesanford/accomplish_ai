"""Adding Scouts to the roster."""

from __future__ import annotations

from datetime import UTC, date, datetime

from firebase_functions import https_fn

from endpoints.consent import send_consent_confirmation, stage_parent_consent
from endpoints.consent_requests import start_request
from endpoints.parent_links import stage_link, stage_roles
from fb import db, fail, is_leader, require_access, troop
from handlers.consent import check_parent_consent, parent_consent_entry
from handlers.consent_requests import clean_parents, needs_parent_consent
from handlers.membership import InvalidInput, new_scout
from handlers.roles import in_order

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT


@https_fn.on_call(secrets=["RESEND_API_KEY"])
def add_scout(req: https_fn.CallableRequest) -> dict:
    """Leaders add Scouts to the roster; parents add their own children, who are linked to them.

    A leader who is also a parent ticks "This is my child" (`isMyChild`). The Scout is then linked to them,
    they become a parent in this troop, and they agree to the parent notice. Without it nothing links.

    For a Scout under 13 (or of unknown age) only a parent can consent. A leader gives one or more parent or guardian
    names and emails (`parents`); each is emailed a link, and until one agrees the Scout is only a name on the roster.
    There is no leader confirmation for a new Scout.
    """
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    roles = set(access.get("roles", []))
    if not roles & {"leader", "scoutmaster", "advancement", "parent"}:
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
        parents = (
            clean_parents(data.get("parents")) if not is_parent and needs_parent_consent(record, now.date()) else []
        )
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    uid, parent_id = req.auth.uid, access["memberId"]
    if is_parent:
        member["guardianIds"] = [parent_id]
    if parents:
        member["consentHold"] = True  # waiting for a parent's consent: nothing else is collected for this Scout
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
    batch.commit()
    if parents:
        start_request(t, troop_id, member_ref.id, parents, parent_id, now, "consent", deletes=True)
    if consent:
        send_consent_confirmation(troop_id, [member_ref.id], consent)
    return {"scoutId": member_ref.id}
