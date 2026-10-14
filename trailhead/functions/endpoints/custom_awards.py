"""Troop-made awards: creating and editing them (with versions), archiving, and moving Scouts."""

from __future__ import annotations

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import db, fail, require_leader, troop
from handlers.custom_awards import check_award_id, clean_award, move_progress, new_award_id, plan_save
from handlers.membership import InvalidInput

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT
MISSING = https_fn.FunctionsErrorCode.NOT_FOUND


def _award_ref(troop_id: str, award_id: str):
    return troop(troop_id).collection("customAwards").document(award_id)


def _requirements(award_ref, version_id: str | None, tx=None) -> list[dict] | None:
    if not version_id:
        return None
    snap = award_ref.collection("versions").document(version_id).get(transaction=tx)
    return (snap.to_dict() or {}).get("requirements") if snap.exists else None


@https_fn.on_call()
def save_custom_award(req: https_fn.CallableRequest) -> dict:
    """Create an award, or edit one. Changed requirements become a new version; Scouts stay on theirs."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_leader(req, troop_id)
    try:
        edit = clean_award(data)
        award_id = check_award_id(data["awardId"]) if data.get("awardId") else new_award_id()
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    ref = _award_ref(troop_id, award_id)
    creating = not data.get("awardId")

    @firestore.transactional
    def save(tx) -> dict:
        snap = ref.get(transaction=tx)
        award = snap.to_dict() if snap.exists else None
        if award is None and not creating:
            raise LookupError
        current = _requirements(ref, (award or {}).get("currentVersionId"), tx)
        plan = plan_save(edit, award, current, access["memberId"])
        fields = dict(plan.award)
        if award is None:
            fields["createdAt"] = firestore.SERVER_TIMESTAMP
        fields["updatedAt"] = firestore.SERVER_TIMESTAMP
        tx.set(ref, fields, merge=True)
        if plan.version_id:
            version = {**plan.version, "createdAt": firestore.SERVER_TIMESTAMP}
            tx.set(ref.collection("versions").document(plan.version_id), version)
        current_id = fields.get("currentVersionId") or award["currentVersionId"]
        return {"awardId": award_id, "versionId": current_id, "newVersion": bool(plan.version_id)}

    try:
        return save(db().transaction())
    except LookupError as err:
        raise fail(MISSING, "That award no longer exists. Reload the page.") from err
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err


@https_fn.on_call()
def archive_custom_award(req: https_fn.CallableRequest) -> dict:
    """Hide an award from new sign-offs (or restore it). Scouts' progress on it is kept."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_leader(req, troop_id)
    try:
        award_id = check_award_id(data.get("awardId"))
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    ref = _award_ref(troop_id, award_id)
    if not ref.get().exists:
        raise fail(MISSING, "That award no longer exists. Reload the page.")
    archived = data.get("archived", True) is not False
    ref.update({"archived": archived, "updatedAt": firestore.SERVER_TIMESTAMP})
    return {"awardId": award_id, "archived": archived}


@https_fn.on_call()
def move_to_custom_version(req: https_fn.CallableRequest) -> dict:
    """Move one Scout's progress to a newer version of an award, carrying what still applies."""
    data = req.data or {}
    troop_id, scout_id, version_id = data.get("troopId"), data.get("scoutId"), data.get("versionId")
    require_leader(req, troop_id)
    try:
        award_id = check_award_id(data.get("awardId"))
        if not scout_id or not version_id:
            raise InvalidInput("Choose a Scout and a version.")
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    ref = _award_ref(troop_id, award_id)
    progress_ref = troop(troop_id).collection("progress").document(f"{scout_id}_{award_id}")

    @firestore.transactional
    def move(tx) -> dict:
        snap = progress_ref.get(transaction=tx)
        progress = snap.to_dict() if snap.exists else None
        new_reqs = _requirements(ref, version_id, tx)
        if new_reqs is None:
            raise InvalidInput("That version of the award doesn't exist. Reload the page.")
        old_reqs = _requirements(ref, (progress or {}).get("versionId"), tx) or []
        result = move_progress(progress, old_reqs, new_reqs, version_id)
        tx.set(progress_ref, result.progress)
        return result.summary

    try:
        return move(db().transaction())
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
