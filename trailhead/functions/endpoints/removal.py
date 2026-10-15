"""A leader removes a Scout from the troop and erases the Scout's data."""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.erase import commit, delete_files, delete_folder, delete_op, update_op
from endpoints.site_consent import _take_down_photos as take_down_photos
from fb import db, fail, require_leader, troop
from handlers.removal import (
    card_folder,
    plan_access,
    plan_draft_gallery,
    plan_exports,
    plan_invites,
    plan_threads,
    usage_ids,
)

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
# Collections whose documents carry the Scout's id in a `scoutId` field.
KEYED_BY_FIELD = ("progress", "blueCards", "signoffs", "logs")


def _docs(query) -> dict[str, dict]:
    return {d.id: d.to_dict() for d in query.stream()}


def _per_event_refs(t, scout_id: str) -> list:
    """Attendance and RSVP entries for the Scout, one pair per event."""
    refs = []
    for event in t.collection("events").list_documents():
        refs.append(event.collection("attendance").document(scout_id))
        refs.append(event.collection("rsvps").document(scout_id))
    return refs


def _plan_ops(t, scout_id: str, scout_uid: str | None) -> tuple[list, list[str], list[str]]:
    """(writes, logins to unlist from users/{uid}, draft website files to delete)."""
    ops = []
    for name in KEYED_BY_FIELD:
        ops += [delete_op(d.reference) for d in t.collection(name).where("scoutId", "==", scout_id).stream()]
    ops += [delete_op(ref) for ref in _per_event_refs(t, scout_id)]

    access = plan_access(scout_id, _docs(t.collection("access")))
    for uid in access.delete_uids:
        ops.append(delete_op(t.collection("access").document(uid)))
    for uid, ids in access.new_scout_ids.items():
        ops.append(update_op(t.collection("access").document(uid), {"scoutIds": ids}))

    drop, trim = plan_invites(scout_id, _docs(t.collection("invites")))
    ops += [delete_op(t.collection("invites").document(c)) for c in drop]
    ops += [update_op(t.collection("invites").document(c), {"scoutIds": ids}) for c, ids in trim.items()]

    threads = _docs(t.collection("threads").where("memberIds", "array_contains", scout_id))
    for thread_id, fields in plan_threads(scout_id, scout_uid, threads).items():
        ops.append(update_op(t.collection("threads").document(thread_id), fields))

    drop, updates = plan_exports(scout_id, _docs(t.collection("exports")))
    ops += [delete_op(t.collection("exports").document(r)) for r in drop]
    ops += [update_op(t.collection("exports").document(r), f) for r, f in updates.items()]

    usage = t.collection("usage")
    ops += [delete_op(usage.document(i)) for i in usage_ids(scout_uid, [d.id for d in usage.list_documents()])]

    draft_ref = t.collection("site").document("draft")
    gallery, files = plan_draft_gallery(scout_id, draft_ref.get().to_dict())
    if gallery is not None:
        ops.append(update_op(draft_ref, {"gallery": gallery}))
    return ops, list(access.delete_uids), files


@https_fn.on_call(timeout_sec=300, memory=512)
def remove_scout(req: https_fn.CallableRequest) -> dict:
    """Delete a Scout's member record and everything keyed to them in this troop. Leaders only.

    Order matters so a failed run can simply be repeated: files first, then dependent documents, and the
    member record last (it is how a repeat run finds the Scout again).
    """
    data = req.data or {}
    troop_id, scout_id = data.get("troopId"), data.get("scoutId")
    require_leader(req, troop_id)
    if not isinstance(scout_id, str) or not scout_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout.")
    if data.get("confirm") is not True:
        raise fail(Code.INVALID_ARGUMENT, "Confirm that you want to delete this Scout's records.")
    t = troop(troop_id)
    member_ref = t.collection("members").document(scout_id)
    member = member_ref.get().to_dict()
    if member is None or member.get("kind") != "scout":
        raise fail(Code.NOT_FOUND, "That Scout isn't on the roster.")
    scout_uid = member.get("uid")

    ops, access_uids, draft_files = _plan_ops(t, scout_id, scout_uid)
    files = delete_folder(card_folder(troop_id, scout_id)) + delete_files(draft_files)
    photos = take_down_photos(troop_id, scout_id)

    for uid in dict.fromkeys([*access_uids, *([scout_uid] if scout_uid else [])]):
        user_ref = db().collection("users").document(uid)
        user_ref.set({"troops": {troop_id: firestore.DELETE_FIELD}}, merge=True)
    commit(ops)
    commit(
        [
            delete_op(t.collection("paths").document(scout_id)),
            delete_op(t.collection("consents").document(scout_id)),
            delete_op(t.collection("scoutRecords").document(scout_id)),
            delete_op(member_ref),
        ]
    )
    log.info("scout removed troop=%s docs=%d files=%d live_photos=%d", troop_id, len(ops) + 4, files, photos)
    return {"removed": True, "documents": len(ops) + 4, "files": files, "photosTakenDown": photos}
