"""Activity credits: camping nights, service hours and hiking miles.

Event credits follow the event's log fields and its attendance. `on_attendance_written` (advancement.py) handles one
Scout; `on_event_written_activity_log` here recomputes everyone when a leader changes the event. Manual entries come
only through the callable functions below, so clients never write the `logs` collection (see firestore.rules).
"""

from __future__ import annotations

import logging
from datetime import date

from firebase_admin import firestore
from firebase_functions import firestore_fn, https_fn

from endpoints.erase import commit, delete_op
from fb import db, fail, is_leader, require_access, require_leader, troop
from handlers.activity_log import (
    MAX_PENDING,
    credit_inputs_changed,
    delete_blocker,
    manual_entry_doc,
    may_add_for,
    parse_manual_entry,
    plan_event_logs,
    review_blocker,
)
from handlers.membership import InvalidInput
from handlers.roles import acts_for

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


@firestore_fn.on_document_written(document="troops/{troopId}/events/{eventId}")
def on_event_written_activity_log(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot | None]]):
    """Recompute every present Scout's credit when an event's log fields, date or title change, or it is deleted."""
    before = event.data.before.to_dict() if event.data.before and event.data.before.exists else None
    after = event.data.after.to_dict() if event.data.after and event.data.after.exists else None
    if before is None and after is None:
        return
    if before is not None and after is not None and not credit_inputs_changed(before, after):
        return
    t, event_id = troop(event.params["troopId"]), event.params["eventId"]
    attendance = t.collection("events").document(event_id).collection("attendance")
    marked = [d.id for d in attendance.where("present", "==", True).stream()] if after is not None else []
    members = {
        d.id: d.to_dict() or {} for d in db().get_all([t.collection("members").document(m) for m in marked]) if d.exists
    }
    present = {m for m in marked if members.get(m, {}).get("kind") == "scout"}
    existing = {d.id: d.to_dict() for d in t.collection("logs").where("eventId", "==", event_id).stream()}
    plan = plan_event_logs(event_id, after, present, existing)
    batch = db().batch()
    for log_id, doc in plan.sets.items():
        batch.set(t.collection("logs").document(log_id), doc)
    for log_id in plan.deletes:
        batch.delete(t.collection("logs").document(log_id))
    if plan.sets or plan.deletes:
        batch.commit()
        log.info("event credits updated set=%d deleted=%d", len(plan.sets), len(plan.deletes))


def _scout(t, scout_id) -> dict:
    member = t.collection("members").document(str(scout_id or "-")).get().to_dict()
    if member is None or member.get("kind") != "scout":
        raise fail(Code.NOT_FOUND, "That Scout isn't on the roster.")
    return member


@https_fn.on_call()
def add_activity_entry(req: https_fn.CallableRequest) -> dict:
    """Add a manual entry (an Eagle project, a long-term camp the troop didn't schedule). A leader's entry counts at
    once. A parent's, or the Scout's own, waits for a leader to approve it."""
    data = req.data or {}
    troop_id, scout_id = data.get("troopId"), data.get("scoutId")
    access = require_access(req, troop_id)
    leader = is_leader(access)
    if not isinstance(scout_id, str) or not may_add_for(access, scout_id, leader):
        raise fail(Code.PERMISSION_DENIED, "You can only add entries for your own Scout.")
    try:
        entry = parse_manual_entry(data, date.today())
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    t = troop(troop_id)
    _scout(t, scout_id)
    if not leader:
        waiting = (
            t.collection("logs").where("scoutId", "==", scout_id).where("status", "==", "pending").limit(MAX_PENDING)
        )
        if len(list(waiting.stream())) >= MAX_PENDING:
            raise fail(Code.RESOURCE_EXHAUSTED, "A leader needs to answer your earlier entries before you add more.")
    me = t.collection("members").document(access["memberId"]).get().to_dict() or {}
    ref = t.collection("logs").document()
    ref.set(
        {
            **manual_entry_doc(entry, scout_id, access["memberId"], me.get("displayName", ""), leader),
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
    )
    return {"entryId": ref.id, "status": "approved" if leader else "pending"}


@https_fn.on_call()
def review_activity_entry(req: https_fn.CallableRequest) -> dict:
    """A leader approves or rejects a manual entry a family submitted."""
    data = req.data or {}
    access = require_leader(req, data.get("troopId"))
    ref = troop(data["troopId"]).collection("logs").document(str(data.get("entryId") or "-"))
    entry = ref.get().to_dict()
    action = data.get("action")
    problem = review_blocker(entry, action)
    if problem:
        missing = entry is None or entry.get("source") != "manual"
        raise fail(Code.NOT_FOUND if missing else Code.FAILED_PRECONDITION, problem)
    status = "approved" if action == "approve" else "rejected"
    ref.update({"status": status, "reviewedByMemberId": access["memberId"], "reviewedAt": firestore.SERVER_TIMESTAMP})
    return {"status": status}


@https_fn.on_call()
def delete_activity_entry(req: https_fn.CallableRequest) -> dict:
    """Delete a manual entry. A leader may delete any; a family only one that is still waiting."""
    data = req.data or {}
    access = require_access(req, data.get("troopId"))
    leader = is_leader(access)
    ref = troop(data["troopId"]).collection("logs").document(str(data.get("entryId") or "-"))
    entry = ref.get().to_dict()
    problem = delete_blocker(entry, leader)
    if problem:
        raise fail(
            Code.NOT_FOUND if entry is None or entry.get("source") != "manual" else Code.PERMISSION_DENIED, problem
        )
    if not leader and not acts_for(access, entry.get("scoutId", "")):
        raise fail(Code.PERMISSION_DENIED, "You can only delete entries for your own Scout.")
    commit([delete_op(ref)])
    return {"deleted": True}
