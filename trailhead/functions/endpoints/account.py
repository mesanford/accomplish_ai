"""Anyone signed in can delete their own account."""

from __future__ import annotations

import logging
from contextlib import suppress

from firebase_admin import auth, firestore
from firebase_functions import https_fn

from endpoints.equipment_erase import holder_ops
from endpoints.erase import commit, delete_op, update_op
from endpoints.feeds import cleanup_ops as feed_cleanup_ops
from endpoints.ledger_retention import forget_author_ops
from fb import db, fail, require_uid, troop
from handlers.account import is_last_leader, last_leader_message, plan_contacts
from handlers.removal import plan_threads, usage_ids

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


def _docs(query) -> dict[str, dict]:
    return {d.id: d.to_dict() for d in query.stream()}


def _check_can_leave(uid: str, troop_id: str, access: dict) -> None:
    t = troop(troop_id)
    others = _docs(t.collection("access"))
    others.pop(uid, None)
    other_members = [m.id for m in t.collection("members").list_documents() if m.id != access["memberId"]]
    if is_last_leader(uid, access, others, other_members):
        raise fail(Code.FAILED_PRECONDITION, last_leader_message((t.get().to_dict() or {}).get("name", "your troop")))


def _adult_ops(t, uid: str, member_id: str) -> list:
    """Everything that names an adult, other than their sign-offs (those stay in the Scouts' records)."""
    ops = [update_op(t, {"yptCopyMemberIds": firestore.ArrayRemove([member_id])})]
    for scout in t.collection("members").where("guardianIds", "array_contains", member_id).stream():
        ops.append(update_op(scout.reference, {"guardianIds": firestore.ArrayRemove([member_id])}))
    for event in t.collection("events").list_documents():
        ops.append(delete_op(event.collection("rsvps").document(member_id)))
        ops.append(delete_op(event.collection("attendance").document(member_id)))
        ops += [delete_op(event.collection(c).document(member_id)) for c in ("signups", "signupNotes", "feeStatus")]
    threads = _docs(t.collection("threads").where("memberIds", "array_contains", member_id))
    for thread_id, fields in plan_threads(member_id, uid, threads).items():
        ops.append(update_op(t.collection("threads").document(thread_id), fields))
    ops += holder_ops(t, member_id, "adult")  # gear loans and requests keep only "Former member"

    name = (t.collection("members").document(member_id).get().to_dict() or {}).get("displayName", "")
    draft_ref = t.collection("site").document("draft")
    slug = ((t.get().to_dict() or {}).get("site") or {}).get("slug")
    public_ref = db().collection("publicSites").document(slug) if slug else None
    public = public_ref.get().to_dict() if public_ref else None
    contacts, public_contacts = plan_contacts(member_id, name, draft_ref.get().to_dict(), public)
    if contacts is not None:
        ops.append(update_op(draft_ref, {"contacts": contacts}))
    if public_contacts is not None:
        ops.append(update_op(public_ref, {"contacts": public_contacts}))
    return ops


def _leave_troop(troop_id: str, uid: str, access: dict) -> int:
    t = troop(troop_id)
    member_id = access["memberId"]
    member_ref = t.collection("members").document(member_id)
    is_scout = (member_ref.get().to_dict() or {}).get("kind") == "scout"

    ops = [delete_op(d.reference) for d in t.collection("invites").where("usedBy", "==", uid).stream()]
    usage = t.collection("usage")
    ops.append(delete_op(t.collection("announcementReads").document(uid)))  # when this login last read announcements
    ops += [delete_op(usage.document(i)) for i in usage_ids(uid, [d.id for d in usage.list_documents()])]
    ops += feed_cleanup_ops(t, uid)
    if is_scout:
        # A Scout's records belong to the troop: only the login is unlinked. A leader can remove the Scout.
        for thread in t.collection("threads").where("participantUids", "array_contains", uid).stream():
            readers = [u for u in thread.to_dict()["participantUids"] if u != uid]
            ops.append(update_op(thread.reference, {"participantUids": readers}))
        last = [update_op(member_ref, {"uid": firestore.DELETE_FIELD})]
    else:
        ops += _adult_ops(t, uid, member_id)
        ops += forget_author_ops(t, uid)  # the entries stay in the troop's books, without this person's name
        last = [delete_op(member_ref)]
    commit(ops)
    # The access record goes last: it is how a repeat run finds this troop again after a failure.
    commit([*last, delete_op(t.collection("access").document(uid))])
    return len(ops) + 2


@https_fn.on_call(timeout_sec=300, memory=512)
def delete_account(req: https_fn.CallableRequest) -> dict:
    """Delete the caller's login, their `users` document, and their access and adult member record in every
    troop. Scouts' records are not touched (they belong to the troop); a Scout's own login is only unlinked."""
    uid = require_uid(req)
    if (req.data or {}).get("confirm") is not True:
        raise fail(Code.INVALID_ARGUMENT, "Confirm that you want to delete your account.")
    user_ref = db().collection("users").document(uid)
    troop_ids = list((user_ref.get().to_dict() or {}).get("troops") or {})
    memberships = {}
    for troop_id in troop_ids:
        snap = troop(troop_id).collection("access").document(uid).get()
        if snap.exists:
            memberships[troop_id] = snap.to_dict()
            _check_can_leave(uid, troop_id, memberships[troop_id])  # refuse before changing anything
    written = sum(_leave_troop(troop_id, uid, access) for troop_id, access in memberships.items())
    for device in user_ref.collection("devices").list_documents():  # push tokens; deleting the user leaves these behind
        device.delete()
    user_ref.delete()
    with suppress(auth.UserNotFoundError):
        auth.delete_user(uid)
    log.info("account deleted troops=%d docs=%d", len(memberships), written)
    return {"deleted": True, "troops": len(memberships)}


@https_fn.on_call()
def set_email_notifications(req: https_fn.CallableRequest) -> dict:
    """Turn emails about blue cards and the caller's Scouts on or off. The consent confirmation is always sent."""
    uid = require_uid(req)
    enabled = (req.data or {}).get("enabled")
    if not isinstance(enabled, bool):
        raise fail(Code.INVALID_ARGUMENT, "Choose on or off.")
    db().collection("users").document(uid).set({"emailNotifications": enabled}, merge=True)
    return {"enabled": enabled}


@https_fn.on_call()
def set_email_announcements(req: https_fn.CallableRequest) -> dict:
    """Turn emailed troop announcements and newsletters on or off. Separate from the blue card emails."""
    uid = require_uid(req)
    enabled = (req.data or {}).get("enabled")
    if not isinstance(enabled, bool):
        raise fail(Code.INVALID_ARGUMENT, "Choose on or off.")
    db().collection("users").document(uid).set({"emailAnnouncements": enabled}, merge=True)
    return {"enabled": enabled}
