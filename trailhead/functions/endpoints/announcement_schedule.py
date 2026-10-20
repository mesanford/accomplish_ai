"""Scheduling an announcement to send later, cancelling it, and the job that sends the due ones.

The checks run twice: when a leader schedules (so a mistake shows at once) and again when it goes out (so a poster who
left the troop or whose training lapsed can't send). A post that can't go out is marked failed with the reason, which
the poster sees on the Announcements page.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn, options, scheduler_fn

from endpoints.announcements import checked_for, publish
from fb import db, fail, require_access, troop, troop_today
from handlers import announcement_schedule as sched
from handlers.announcements import can_manage
from handlers.membership import InvalidInput

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


@https_fn.on_call(timeout_sec=60, memory=512)
def schedule_announcement(req: https_fn.CallableRequest) -> dict:
    """Check a post as if it were sent now, then keep it to send at `sendAt`."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    try:
        send_at = sched.parse_send_at(data.get("sendAt"), datetime.now(UTC))
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    checked = checked_for(access, troop_id, data, troop_today(troop_id))
    audience, sender = checked[4], checked[7]
    ref = troop(troop_id).collection("scheduledPosts").document()
    ref.set(
        {
            "request": sched.request_of(data),
            "title": str(data.get("title") or "")[:120],
            "kind": data.get("kind") or "announcement",
            "audienceLabel": audience.label,
            "email": data.get("email") is True,
            "sendAt": send_at,
            "status": sched.SCHEDULED,
            "postedByUid": req.auth.uid,
            "postedByMemberId": access["memberId"],
            "postedByName": sender.get("displayName", "A leader"),
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
    )
    return {"scheduledId": ref.id, "sendAt": send_at.isoformat()}


@https_fn.on_call()
def cancel_scheduled_announcement(req: https_fn.CallableRequest) -> dict:
    """The poster, a Scoutmaster or an advancement chair removes a post that hasn't gone out yet."""
    data = req.data or {}
    access = require_access(req, data.get("troopId"))
    ref = troop(data["troopId"]).collection("scheduledPosts").document(str(data.get("scheduledId") or "-"))
    post = ref.get().to_dict()
    if post is None or post.get("status") not in (sched.SCHEDULED, sched.FAILED):
        raise fail(Code.NOT_FOUND, "That scheduled post was not found, or it has already gone out.")
    if not can_manage(access, req.auth.uid, post):
        raise fail(Code.PERMISSION_DENIED, "Only the person who scheduled it or a Scoutmaster can remove it.")
    ref.delete()
    return {"removed": True}


def _claim(ref) -> dict | None:
    """The post, if this run is the one to send it."""

    @firestore.transactional
    def run(tx) -> dict | None:
        post = ref.get(transaction=tx).to_dict()
        if not post or post.get("status") != sched.SCHEDULED:
            return None
        tx.update(ref, {"status": sched.SENDING})
        return post

    return run(db().transaction())


def _send(troop_id: str, ref, post: dict, now: datetime) -> bool:
    uid = post["postedByUid"]
    data = {**post["request"], "troopId": troop_id}
    try:
        access = troop(troop_id).collection("access").document(uid).get().to_dict()
        if access is None:
            raise fail(Code.PERMISSION_DENIED, "The person who scheduled it is no longer in the troop.")
        today = troop_today(troop_id, now)
        result = publish(uid, checked_for(access, troop_id, data, today), data, today)
    except https_fn.HttpsError as err:
        ref.update({"status": sched.FAILED, "reason": err.message})
        return False
    ref.update({"status": sched.SENT, "announcementId": result["announcementId"], "sentAt": firestore.SERVER_TIMESTAMP})
    return True


def run_scheduled(now: datetime) -> dict:
    """Send every due post in every troop. Returns counts, for tests and the log."""
    totals = {"sent": 0, "failed": 0}
    for snap in db().collection("troops").stream():
        for doc in snap.reference.collection("scheduledPosts").where("sendAt", "<=", now).stream():
            if not sched.due(doc.to_dict() or {}, now):
                continue
            try:
                post = _claim(doc.reference)
                if post is not None:
                    totals["sent" if _send(snap.id, doc.reference, post, now) else "failed"] += 1
            except Exception:
                log.exception("scheduled announcement failed troop=%s", snap.id)
                doc.reference.update({"status": sched.FAILED, "reason": "Something went wrong sending it."})
                totals["failed"] += 1
    log.info("scheduled announcements done totals=%s", totals)
    return totals


@scheduler_fn.on_schedule(
    schedule="every 15 minutes",
    timeout_sec=300,
    memory=options.MemoryOption.MB_512,
    secrets=["RESEND_API_KEY"],
)
def send_scheduled_announcements(event: scheduler_fn.ScheduledEvent) -> None:
    run_scheduled(datetime.now(UTC))
