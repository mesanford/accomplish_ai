"""find_places: places from the catalog for a plan's research step, nearest the troop first.

"nearby" lists campgrounds and state parks in the troop's state and the states next to it; the closest get real
drive times from OpenRouteService (one request, counted like a drive time estimate). "highAdventure" lists the
national high adventure bases with the facts their own pages state. Anyone who shares in planning may ask.
"""

from __future__ import annotations

import os

from firebase_functions import https_fn

from endpoints.drive_time import home_location, ors_request, take_drive_slot
from endpoints.mailer import in_emulator
from endpoints.plans_shared import READ, allowed
from fb import db, fail, require_access, troop, troop_today
from handlers import places_find as find
from handlers.places import HIGH_ADVENTURE
from handlers.places_states import region

Code = https_fn.FunctionsErrorCode
LIMIT, TIMED = 40, 25


def _key() -> str:
    key = os.environ.get("ORS_API_KEY", "")
    return "" if in_emulator() or not key or key.startswith("emulator") else key


def _home(t, key: str):
    """The meeting place's location: kept from an earlier lookup, or looked up now if the service is available."""
    kept = t.collection("planning").document("home").get().to_dict() or {}
    if isinstance(kept.get("lat"), float):
        return kept["lat"], kept["lng"]
    if not key:
        return None
    try:
        return home_location(t, key)
    except Exception:
        return None


def _drive_times(t, troop_id: str, home, rows: list[dict], key: str) -> list[dict]:
    if not key or not home or not rows or not take_drive_slot(t, troop_today(troop_id)):
        return rows
    near = rows[:TIMED]
    body = {
        "locations": [[home[1], home[0]], *[[r["lng"], r["lat"]] for r in near]],
        "sources": [0],
        "destinations": list(range(1, len(near) + 1)),
        "metrics": ["duration"],
    }
    try:
        seconds = (ors_request("/v2/matrix/driving-car", key, body).get("durations") or [[]])[0]
    except Exception:
        return rows
    timed = find.with_drive_times(near, seconds)
    timed.sort(key=lambda r: (r["driveMinutes"] is None, r["driveMinutes"] or 0))
    return timed + rows[TIMED:]


@https_fn.on_call(secrets=["ORS_API_KEY"])
def find_places(req: https_fn.CallableRequest) -> dict:
    """`{troopId, planId?, mode: "nearby" | "highAdventure"}` -> `{places, nearYou}`."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    t = troop(troop_id)
    plan = t.collection("eventPlans").document(str(data.get("planId") or "-")).get().to_dict() or {}
    if not allowed(READ, access, plan, req.auth.uid):
        raise fail(Code.PERMISSION_DENIED, "Only the troop's planners and Scouts can look for places.")
    places = db().collection("places")
    key = _key()
    home = _home(t, key)
    if data.get("mode") == "highAdventure":
        found = {d.id: d.to_dict() for d in places.where("kind", "==", HIGH_ADVENTURE).stream()}
        return {"places": find.rank(found, home, None, LIMIT), "nearYou": home is not None}
    state = (((t.get().to_dict() or {}).get("meetingPlace") or {}).get("state") or "").upper()
    states = region(state)
    if not states:
        raise fail(Code.FAILED_PRECONDITION, "Add the troop's meeting place on Troop settings first.")
    found = find.nearby_kinds({d.id: d.to_dict() for d in places.where("state", "in", states).stream()})
    max_drive = (plan.get("brief") or {}).get("maxDriveMinutes")
    rows = find.rank(found, home, max_drive, LIMIT)
    return {"places": _drive_times(t, troop_id, home, rows, key), "nearYou": home is not None}
