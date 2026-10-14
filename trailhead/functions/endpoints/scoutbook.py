"""Scoutbook Plus handoff reports. Leaders create them and tick off Scouts once entered in Scoutbook."""

from __future__ import annotations

from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import fail, require_leader, troop
from handlers.membership import InvalidInput
from handlers.scoutbook import build_report, check_entered_request, new_report, nothing_new_message, row_keys
from trailhead_core import load_catalog

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT


def _docs(ref) -> list[dict]:
    return [d.to_dict() for d in ref.stream()]


@https_fn.on_call()
def create_scoutbook_report(req: https_fn.CallableRequest) -> dict:
    """Everything signed since the last handoff, by Scout. Stores nothing when there is nothing new."""
    troop_id = (req.data or {}).get("troopId")
    access = require_leader(req, troop_id)
    t = troop(troop_id)
    since = (t.get().to_dict() or {}).get("lastScoutbookExportAt")
    until = datetime.now(UTC)
    newest = t.collection("exports").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(1)
    last = list(newest.stream())
    already = row_keys(last[0].to_dict().get("rows", [])) if last else set()
    members = {d.id: d.to_dict() for d in t.collection("members").stream()}
    records = {d.id: d.to_dict() for d in t.collection("scoutRecords").stream()}
    accepted = t.collection("signoffs").where("status", "==", "accepted")
    rows = build_report(
        _docs(accepted), _docs(t.collection("progress")), records, members, load_catalog(), since, until, already
    )
    if not rows:
        return {"created": False, "message": nothing_new_message(since)}
    ref = t.collection("exports").document()
    ref.set({**new_report(rows, since, until, access["memberId"]), "createdAt": firestore.SERVER_TIMESTAMP})
    t.update({"lastScoutbookExportAt": until})
    return {"created": True, "reportId": ref.id, "rowCount": len(rows)}


@https_fn.on_call()
def set_scoutbook_entered(req: https_fn.CallableRequest) -> dict:
    """Tick a Scout off (or back on) as entered in Scoutbook Plus on one report."""
    data = req.data or {}
    require_leader(req, data.get("troopId"))
    ref = troop(data["troopId"]).collection("exports").document(str(data.get("reportId") or "-"))
    try:
        scout_id = check_entered_request(ref.get().to_dict(), data.get("scoutId"))
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    change = firestore.ArrayUnion if data.get("entered") else firestore.ArrayRemove
    ref.update({"enteredScoutIds": change([scout_id])})
    return {"ok": True}
