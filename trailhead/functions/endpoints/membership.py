"""Creating troops, inviting people and adding Scouts."""

from __future__ import annotations

import secrets
from datetime import UTC, date, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.consent import send_consent_confirmation, stage_leader_confirmation, stage_parent_consent
from fb import db, fail, require_access, require_leader, require_uid, troop
from handlers.consent import (
    check_leader_confirmation,
    check_parent_consent,
    leader_confirmation_entry,
    parent_consent_entry,
)
from handlers.membership import (
    InvalidInput,
    adult_member,
    check_invite,
    new_invite,
    new_scout,
    new_troop,
    scout_login_blocker,
)

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT
EXISTS = https_fn.FunctionsErrorCode.ALREADY_EXISTS


def _membership(troop_doc: dict, member_id: str, roles: list[str]) -> dict:
    """The entry in users/{uid}.troops that lets the app list a person's troops."""
    return {"name": troop_doc["name"], "unitNumber": troop_doc["unitNumber"], "memberId": member_id, "roles": roles}


def _access(member_id: str, roles: list[str], scout_ids: list[str], ypt) -> dict:
    return {"memberId": member_id, "roles": roles, "scoutIds": scout_ids, "yptExpiresAt": ypt}


@https_fn.on_call()
def create_troop(req: https_fn.CallableRequest) -> dict:
    """The caller becomes the troop's first leader."""
    uid = require_uid(req)
    try:
        troop_doc, member = new_troop(req.data or {}, uid, date.today())
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    ref = db().collection("troops").document()
    member_ref = ref.collection("members").document()
    batch = db().batch()
    batch.set(ref, {**troop_doc, "yptCopyMemberIds": [member_ref.id], "createdAt": firestore.SERVER_TIMESTAMP})
    batch.set(member_ref, member)
    batch.set(ref.collection("access").document(uid), _access(member_ref.id, ["leader"], [], member["yptExpiresAt"]))
    user_ref = db().collection("users").document(uid)
    batch.set(user_ref, {"troops": {ref.id: _membership(troop_doc, member_ref.id, ["leader"])}}, merge=True)
    batch.commit()
    return {"troopId": ref.id, "memberId": member_ref.id}


@https_fn.on_call()
def create_invite(req: https_fn.CallableRequest) -> dict:
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_leader(req, troop_id)
    t = troop(troop_id)
    scouts = {d.id: d.to_dict() for d in t.collection("members").where("kind", "==", "scout").stream()}
    unlinked = {sid for sid, m in scouts.items() if not m.get("uid")}
    now = datetime.now(UTC)
    try:
        invite = new_invite(data, set(scouts), unlinked, now)
        if invite["role"] == "scout":
            record = t.collection("scoutRecords").document(invite["scoutMemberId"]).get().to_dict()
            blocker = scout_login_blocker(record, now.date())
            if blocker:
                raise InvalidInput(blocker)
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    lead_ref = None
    if data.get("leadId"):
        if invite["role"] != "parent":
            raise fail(BAD, "A website family can only be invited as a parent.")
        lead_ref = t.collection("leads").document(str(data["leadId"]))
        if not lead_ref.get().exists:
            raise fail(BAD, "That family isn't in your recruiting list.")
        invite["leadId"] = lead_ref.id
    code = secrets.token_urlsafe(16)
    path = f"/join/{troop_id}/{code}"
    t.collection("invites").document(code).set({**invite, "createdBy": access["memberId"], "createdAt": now})
    if lead_ref is not None:
        lead_ref.update({"status": "invited", "invitePath": path, "invitedAt": now})
    return {"code": code, "path": path, "expiresAt": invite["expiresAt"].isoformat()}


@https_fn.on_call()
def accept_invite(req: https_fn.CallableRequest) -> dict:
    uid = require_uid(req)
    data = req.data or {}
    troop_id, code = data.get("troopId"), data.get("code")
    if not troop_id or not code:
        raise fail(BAD, "This invite link is incomplete.")
    t = troop(troop_id)
    if t.collection("access").document(uid).get().exists:
        raise fail(EXISTS, "You're already a member of this troop.")

    @firestore.transactional
    def accept(tx) -> tuple[str, list[str], dict | None]:
        invite_ref = t.collection("invites").document(code)
        snap = invite_ref.get(transaction=tx)
        invite = check_invite(snap.to_dict() if snap.exists else None, datetime.now(UTC))
        troop_doc = t.get(transaction=tx).to_dict()
        role = invite["role"]
        consent = None
        if role == "parent":
            check_parent_consent(data)  # a parent can't join without agreeing to the notice
        if role == "scout":
            member_id = invite["scoutMemberId"]
            member_ref = t.collection("members").document(member_id)
            if (member_ref.get(transaction=tx).to_dict() or {}).get("uid"):
                raise InvalidInput("This Scout already has a login.")
            tx.update(member_ref, {"uid": uid})
            scout_ids, ypt = [member_id], None
        else:
            member_ref = t.collection("members").document()
            member = adult_member(data, uid, [role], date.today())
            tx.set(member_ref, member)
            member_id, ypt = member_ref.id, member["yptExpiresAt"]
            scout_ids = invite.get("scoutIds", [])
            for scout_id in scout_ids:
                tx.update(
                    t.collection("members").document(scout_id), {"guardianIds": firestore.ArrayUnion([member_id])}
                )
            consent = parent_consent_entry(uid, member_id, datetime.now(UTC))
            stage_parent_consent(tx, t, scout_ids, consent)
        tx.set(t.collection("access").document(uid), _access(member_id, [role], scout_ids, ypt))
        user = {"troops": {troop_id: _membership(troop_doc, member_id, [role])}}
        tx.set(db().collection("users").document(uid), user, merge=True)
        used = {"usedBy": uid, "usedAt": datetime.now(UTC)}
        tx.update(invite_ref, {**used, "consentVersion": consent["version"]} if consent else used)
        if invite.get("leadId"):
            tx.update(t.collection("leads").document(invite["leadId"]), {"status": "joined"})
        return member_id, scout_ids, consent

    try:
        member_id, scout_ids, consent = accept(db().transaction())
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    if consent:
        send_consent_confirmation(troop_id, scout_ids, consent)
    return {"troopId": troop_id, "memberId": member_id}


@https_fn.on_call()
def add_scout(req: https_fn.CallableRequest) -> dict:
    """Leaders add Scouts to the roster; parents add their own children, who are linked to them."""
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
    is_parent = "parent" in roles
    now = datetime.now(UTC)
    try:
        if is_parent:
            check_parent_consent(data)  # a parent adding their child agrees to the same notice
        confirmed = not is_parent and check_leader_confirmation(data, record, now.date())
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    if is_parent:
        member["guardianIds"] = [access["memberId"]]
    batch = db().batch()
    batch.set(member_ref, member)
    batch.set(t.collection("scoutRecords").document(member_ref.id), record)
    consent = None
    if is_parent:
        consent = parent_consent_entry(req.auth.uid, access["memberId"], now)
        stage_parent_consent(batch, t, [member_ref.id], consent)
    elif confirmed:
        entry = leader_confirmation_entry(req.auth.uid, access["memberId"], now)
        stage_leader_confirmation(batch, t, member_ref.id, entry)
    if is_parent:
        batch.update(t.collection("access").document(req.auth.uid), {"scoutIds": firestore.ArrayUnion([member_ref.id])})
    batch.commit()
    if consent:
        send_consent_confirmation(troop_id, [member_ref.id], consent)
    return {"scoutId": member_ref.id}
