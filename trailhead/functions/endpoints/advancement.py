"""Sign-offs, attendance, blue cards and path checks."""

from __future__ import annotations

from contextlib import suppress

from firebase_admin import firestore
from firebase_functions import firestore_fn, https_fn
from google.api_core.exceptions import NotFound

from fb import db, fail, kind_blocker, require_access, troop
from handlers.activity_log import event_log_id
from handlers.attendance import attendance_effects, mark_ready
from handlers.paths import feasibility_doc, needs_recheck, path_from_doc, scout_from_docs
from handlers.retention import today_local
from handlers.signoffs import apply_signoff
from trailhead_core import check_path
from trailhead_core.catalog import is_custom_award

Written = firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot | None]]


def _before_after(event: Written) -> tuple[dict | None, dict | None]:
    before = event.data.before.to_dict() if event.data.before and event.data.before.exists else None
    after = event.data.after.to_dict() if event.data.after and event.data.after.exists else None
    return before, after


@firestore_fn.on_document_created(document="troops/{troopId}/signoffs/{signoffId}")
def on_signoff_created(event: firestore_fn.Event[firestore_fn.DocumentSnapshot | None]) -> None:
    if event.data is None:
        return
    signoff = event.data.to_dict()
    if signoff.get("status") != "pending":
        return  # paper blue cards write accepted sign-offs and their progress directly
    t = troop(event.params["troopId"])
    progress_ref = t.collection("progress").document(f"{signoff['scoutId']}_{signoff['awardId']}")

    custom_ids = None
    if is_custom_award(signoff["awardId"]):
        version = t.collection("customAwards").document(signoff["awardId"]).collection("versions")
        version_doc = version.document(signoff["versionId"]).get().to_dict() or {}
        custom_ids = [r["id"] for r in version_doc.get("requirements", [])]

    @firestore.transactional
    def apply(tx):
        snap = progress_ref.get(transaction=tx)
        current = snap.to_dict() if snap.exists else None
        outcome = apply_signoff(event.params["signoffId"], signoff, current, custom_ids, today_local())
        if outcome.accepted:
            tx.set(progress_ref, outcome.progress)
            tx.update(event.data.reference, {"status": "accepted"})
        else:
            tx.update(event.data.reference, {"status": "rejected", "rejectedReason": outcome.reason})

    apply(db().transaction())


@firestore_fn.on_document_written(document="troops/{troopId}/blueCards/{cardId}")
def on_blue_card_written(event: Written) -> None:
    """A counselor completing a blue card completes the badge in the Scout's progress."""
    before, after = _before_after(event)
    if not after or after.get("status") != "complete" or (before or {}).get("status") == "complete":
        return
    if after.get("source") == "paper":
        return  # record_paper_blue_card wrote the progress with the card's real completion date
    ref = troop(event.params["troopId"]).collection("progress").document(event.params["cardId"])
    ref.set(
        {
            "scoutId": after["scoutId"],
            "awardId": after["awardId"],
            "versionId": after["versionId"],
            "status": "complete",
            "completedAt": str(today_local()),
            "completedByUid": after.get("counselorUid"),
        },
        merge=True,
    )


@firestore_fn.on_document_written(document="troops/{troopId}/events/{eventId}/attendance/{memberId}")
def on_attendance_written(event: Written) -> None:
    _, after = _before_after(event)
    t = troop(event.params["troopId"])
    member_id, event_id = event.params["memberId"], event.params["eventId"]
    log_ref = t.collection("logs").document(event_log_id(event_id, member_id))
    if after is None:
        log_ref.delete()  # the attendance entry was removed, so the credit goes too
        return
    event_doc = t.collection("events").document(event_id).get().to_dict() or {}
    member_doc = t.collection("members").document(member_id).get().to_dict() or {}
    consent_doc = t.collection("consents").document(member_id).get().to_dict()
    if kind_blocker(member_doc, consent_doc, "activity"):  # no credit or progress while consent is awaited
        log_ref.delete()
        return
    effects = attendance_effects(event_id, event_doc, {**member_doc, "id": member_id}, bool(after.get("present")))
    # Idempotent: the credit has a fixed id, is rewritten only when it differs, and goes when the Scout is not present.
    existing = log_ref.get().to_dict()
    if effects.log is None:
        if existing is not None:
            log_ref.delete()
    elif existing != effects.log:
        log_ref.set(effects.log)
    for award_id, req_id in effects.ready:
        ref = t.collection("progress").document(f"{member_id}_{award_id}")
        snap = ref.get()
        version = (snap.to_dict() or {}).get("versionId") if snap.exists else _current_version(award_id)
        if version is None:
            continue  # award content not loaded yet; nothing safe to mark
        updated = mark_ready(snap.to_dict() if snap.exists else None, member_id, award_id, version, req_id)
        if updated:
            ref.set(updated)


def _current_version(award_id: str) -> str | None:
    snap = db().collection("awards").document(award_id).get()
    return (snap.to_dict() or {}).get("currentVersionId") if snap.exists else None


def _scout_record(t, scout_id: str):
    record = t.collection("scoutRecords").document(scout_id).get().to_dict()
    if record is None:
        return None
    progress = [d.to_dict() for d in t.collection("progress").where("scoutId", "==", scout_id).stream()]
    return scout_from_docs(scout_id, record, progress)


NO_RECORD = {
    "status": "at_risk",
    "issues": [{"code": "no_scout_record", "severity": "warning", "message": "Add the Scout's birth month and rank."}],
}


@firestore_fn.on_document_written(document="troops/{troopId}/paths/{pathId}")
def on_path_written(event: Written) -> None:
    recheck_path(event)


def recheck_path(event: Written) -> None:
    before, after = _before_after(event)
    if not needs_recheck(before, after):
        return
    scout = _scout_record(troop(event.params["troopId"]), after["scoutId"])
    result = NO_RECORD if scout is None else feasibility_doc(check_path(path_from_doc(after), scout, today_local()))
    # The path can be deleted while it's checked (removing a Scout erases their paths); don't fail, or recreate it.
    with suppress(NotFound):
        event.data.after.reference.update({"feasibility": result})


@https_fn.on_call()
def check_path_preview(req: https_fn.CallableRequest) -> dict:
    """Check an unsaved path (for the planner's live feedback). Caller must be able to see the Scout."""
    troop_id, path_data = req.data.get("troopId"), req.data.get("path") or {}
    require_access(req, troop_id, scout_id=path_data.get("scoutId"))
    scout = _scout_record(troop(troop_id), path_data["scoutId"])
    if scout is None:
        raise fail(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "No Scout record yet.")
    return feasibility_doc(check_path(path_from_doc(path_data), scout, today_local()))
