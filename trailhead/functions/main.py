"""Trailhead Cloud Functions (2nd gen, Python). Logic lives in `handlers` and `trailhead_core`."""

from __future__ import annotations

import os
from datetime import date
from functools import cache

from firebase_admin import firestore, initialize_app
from firebase_functions import firestore_fn, https_fn, options

from handlers.attendance import attendance_effects, mark_ready
from handlers.messaging import participant_uids, people_from_members
from handlers.paths import feasibility_doc, needs_recheck, path_from_doc, scout_from_docs
from handlers.signoffs import apply_signoff
from trailhead_core import YPTViolation, check_path, plan_delivery

initialize_app()
options.set_global_options(region="us-central1", max_instances=10)


@cache
def _db():
    if os.environ.get("FUNCTIONS_EMULATOR") == "true" and os.environ.get("FIRESTORE_EMULATOR_HOST"):
        # The emulator needs no real credentials; the Admin SDK would otherwise demand them.
        from google.auth.credentials import AnonymousCredentials
        from google.cloud import firestore as gcf

        return gcf.Client(project=os.environ["GCLOUD_PROJECT"], credentials=AnonymousCredentials())
    return firestore.client()


def _troop(troop_id: str):
    return _db().collection("troops").document(troop_id)


# --- Sign-offs ---------------------------------------------------------------------------


@firestore_fn.on_document_created(document="troops/{troopId}/signoffs/{signoffId}")
def on_signoff_created(event: firestore_fn.Event[firestore_fn.DocumentSnapshot | None]) -> None:
    if event.data is None:
        return
    signoff = event.data.to_dict()
    troop = _troop(event.params["troopId"])
    progress_ref = troop.collection("progress").document(f"{signoff['scoutId']}_{signoff['awardId']}")

    @firestore.transactional
    def apply(tx):
        snap = progress_ref.get(transaction=tx)
        outcome = apply_signoff(event.params["signoffId"], signoff, snap.to_dict() if snap.exists else None)
        if outcome.accepted:
            tx.set(progress_ref, outcome.progress)
            tx.update(event.data.reference, {"status": "accepted"})
        else:
            tx.update(event.data.reference, {"status": "rejected", "rejectedReason": outcome.reason})

    apply(_db().transaction())


# --- Attendance --------------------------------------------------------------------------


@firestore_fn.on_document_written(document="troops/{troopId}/events/{eventId}/attendance/{memberId}")
def on_attendance_written(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot | None]]) -> None:
    after = event.data.after
    if after is None or not after.exists:
        return
    troop = _troop(event.params["troopId"])
    member_id, event_id = event.params["memberId"], event.params["eventId"]
    event_doc = troop.collection("events").document(event_id).get().to_dict() or {}
    member_doc = troop.collection("members").document(member_id).get().to_dict() or {}
    effects = attendance_effects(event_id, event_doc, {**member_doc, "id": member_id}, bool(after.get("present")))
    if effects.log:
        troop.collection("logs").document(f"{event_id}_{member_id}").set(effects.log)
    for award_id, req_id in effects.ready:
        ref = troop.collection("progress").document(f"{member_id}_{award_id}")
        snap = ref.get()
        version = (snap.to_dict() or {}).get("versionId") if snap.exists else _current_version(award_id)
        if version is None:
            continue  # award content not loaded yet; nothing safe to mark
        updated = mark_ready(snap.to_dict() if snap.exists else None, member_id, award_id, version, req_id)
        if updated:
            ref.set(updated)


def _current_version(award_id: str) -> str | None:
    snap = _db().collection("awards").document(award_id).get()
    return (snap.to_dict() or {}).get("currentVersionId") if snap.exists else None


# --- Paths -------------------------------------------------------------------------------


def _scout_record(troop, scout_id: str):
    record = troop.collection("scoutRecords").document(scout_id).get().to_dict()
    if record is None:
        return None
    progress = [d.to_dict() for d in troop.collection("progress").where("scoutId", "==", scout_id).stream()]
    return scout_from_docs(scout_id, record, progress)


@firestore_fn.on_document_written(document="troops/{troopId}/paths/{pathId}")
def on_path_written(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot | None]]) -> None:
    before = event.data.before.to_dict() if event.data.before and event.data.before.exists else None
    after = event.data.after.to_dict() if event.data.after and event.data.after.exists else None
    if not needs_recheck(before, after):
        return
    scout = _scout_record(_troop(event.params["troopId"]), after["scoutId"])
    if scout is None:
        result = {
            "status": "at_risk",
            "issues": [
                {
                    "code": "no_scout_record",
                    "severity": "warning",
                    "message": "Add the Scout's birth month and rank dates.",
                }
            ],
        }
    else:
        result = feasibility_doc(check_path(path_from_doc(after), scout, date.today()))
    event.data.after.reference.update({"feasibility": result})


@https_fn.on_call()
def check_path_preview(req: https_fn.CallableRequest) -> dict:
    """Check an unsaved path (for the planner's live feedback). Caller must be able to see the Scout."""
    troop_id, path_data = req.data.get("troopId"), req.data.get("path") or {}
    _require_access(req, troop_id, scout_id=path_data.get("scoutId"))
    scout = _scout_record(_troop(troop_id), path_data["scoutId"])
    if scout is None:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "No Scout record yet.")
    return feasibility_doc(check_path(path_from_doc(path_data), scout, date.today()))


# --- Messaging ---------------------------------------------------------------------------


@https_fn.on_call()
def send_message(req: https_fn.CallableRequest) -> dict:
    """The only way to write a message. Adds parents or a second adult as Youth Protection requires."""
    troop_id, body = req.data.get("troopId"), (req.data.get("body") or "").strip()
    recipient_ids = list(dict.fromkeys(req.data.get("recipientMemberIds") or []))
    access = _require_access(req, troop_id)
    if not body or not recipient_ids:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "A message needs text and recipients.")
    troop = _troop(troop_id)
    members = {d.id: d.to_dict() for d in troop.collection("members").stream()}
    people = people_from_members(members)
    sender_id = access["memberId"]
    if sender_id not in people or any(r not in people for r in recipient_ids):
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "Unknown recipient.")
    second_adults = (troop.get().to_dict() or {}).get("yptCopyMemberIds", [])
    try:
        delivery = plan_delivery(
            people[sender_id], [people[r] for r in recipient_ids], people, second_adults, date.today()
        )
    except YPTViolation as err:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.PERMISSION_DENIED, str(err)) from err
    all_members = [sender_id, *delivery.recipient_ids]
    thread = troop.collection("threads").document()
    thread.set(
        {
            "memberIds": all_members,
            "participantUids": participant_uids(all_members, members),
            "yptAddedMemberIds": delivery.added_ids,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
    )
    thread.collection("messages").add(
        {"senderMemberId": sender_id, "body": body, "createdAt": firestore.SERVER_TIMESTAMP}
    )
    return {"threadId": thread.id, "recipientMemberIds": delivery.recipient_ids, "addedMemberIds": delivery.added_ids}


def _require_access(req: https_fn.CallableRequest, troop_id: str | None, scout_id: str | None = None) -> dict:
    if req.auth is None or not troop_id:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.UNAUTHENTICATED, "Sign in first.")
    snap = _troop(troop_id).collection("access").document(req.auth.uid).get()
    access = snap.to_dict() if snap.exists else None
    if access is None:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "Not a member of this troop.")
    is_leader = bool({"leader", "advancement"} & set(access.get("roles", [])))
    if scout_id and not is_leader and scout_id not in access.get("scoutIds", []):
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "You can't see this Scout.")
    return access
