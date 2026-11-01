"""estimate_drive_time: the drive from the troop's meeting place to a place on a Google Maps link, for a research
card. See handlers/drive_time.py. It needs the ORS_API_KEY secret (a free OpenRouteService key); the emulator
never calls the service. Planners and the plan's trip lead may ask, up to DAILY_CAP times a troop a day, so one
troop can't use up the shared free quota. The troop's meeting place is looked up once and kept in
troops/{t}/planning/home (server only) until its address changes.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.mailer import in_emulator
from endpoints.plans_shared import EDIT, allowed
from fb import db, fail, require_access, troop, troop_today
from handlers import drive_time as dt
from handlers.membership import InvalidInput

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
ORS = "https://api.openrouteservice.org"
DAILY_CAP = 60
TIMEOUT = 10
TRY_LATER = "We couldn't get a drive time right now. Try again, or enter it yourself."


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # hand each hop back to us, so we check it before following


def _follow(url: str) -> str | None:
    """The address a short link redirects to, without fetching it."""
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        opener.open(urllib.request.Request(url, headers={"User-Agent": "Forthright/1.0"}), timeout=TIMEOUT)
    except urllib.error.HTTPError as err:
        if 300 <= err.code < 400:
            return urllib.parse.urljoin(url, err.headers.get("Location", ""))
    except Exception:
        log.warning("short maps link could not be followed")
    return None


def ors_request(path: str, key: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": key, "Accept": "application/json", "User-Agent": "Forthright/1.0"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"{ORS}{path}", data, headers, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read())


def _geocoder(key: str):
    def geocode(text: str):
        query = urllib.parse.urlencode({"text": text, "boundary.country": "US", "size": 1})
        return dt.geocoded(ors_request(f"/geocode/search?{query}", key))

    return geocode


def home_location(t, key: str):
    """The meeting place's location, looked up again only when its address changed."""
    address = dt.home_address((t.get().to_dict() or {}).get("meetingPlace"))
    if not address:
        raise fail(Code.FAILED_PRECONDITION, "Add the troop's meeting place address on Troop settings first.")
    ref = t.collection("planning").document("home")
    kept = ref.get().to_dict() or {}
    if kept.get("address") == address and isinstance(kept.get("lat"), float):
        return kept["lat"], kept["lng"]
    found = _geocoder(key)(address)
    if found is None:
        raise fail(Code.FAILED_PRECONDITION, "We couldn't find the meeting place address. Check it on Troop settings.")
    ref.set({"address": address, "lat": found[0], "lng": found[1], "at": firestore.SERVER_TIMESTAMP})
    return found


def take_drive_slot(t, today) -> bool:
    ref = t.collection("usage").document(f"drive_{today.isoformat()}")  # cleared by the retention job by its day

    @firestore.transactional
    def take(tx) -> bool:
        used = (ref.get(transaction=tx).to_dict() or {}).get("count", 0)
        if used >= DAILY_CAP:
            return False
        tx.set(ref, {"count": used + 1})
        return True

    return take(db().transaction())


@https_fn.on_call(secrets=["ORS_API_KEY"])
def estimate_drive_time(req: https_fn.CallableRequest) -> dict:
    """`{troopId, planId, mapsUrl}` -> `{minutes, miles}`. Nothing is saved on the card; the planner saves it."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    t = troop(troop_id)
    plan = t.collection("eventPlans").document(str(data.get("planId") or "-")).get().to_dict()
    if not plan or not allowed(EDIT, access, plan, req.auth.uid):
        raise fail(Code.PERMISSION_DENIED, "Only the plan's planners can do that.")
    try:
        dt.read_link(data.get("mapsUrl"))  # refuse a bad link before using any quota
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    key = os.environ.get("ORS_API_KEY", "")
    if in_emulator() or not key or key.startswith("emulator"):
        raise fail(Code.FAILED_PRECONDITION, "Drive time estimates aren't set up here. Enter the minutes yourself.")
    if not take_drive_slot(t, troop_today(troop_id)):
        raise fail(Code.RESOURCE_EXHAUSTED, "Your troop has used today's drive time estimates. Try again tomorrow.")
    try:
        start = home_location(t, key)
        end = dt.destination(data["mapsUrl"], _follow, _geocoder(key))
        body = {"coordinates": [[start[1], start[0]], [end[1], end[0]]]}
        summary = dt.route_summary(ors_request("/v2/directions/driving-car", key, body))
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    except urllib.error.HTTPError as err:
        if err.code == 404:  # OpenRouteService found no road near one end
            raise fail(Code.NOT_FOUND, "We couldn't find a driving route to that place.") from None
        log.warning("drive time lookup failed status=%s", err.code)
        raise fail(Code.UNAVAILABLE, TRY_LATER) from None
    except (urllib.error.URLError, TimeoutError, ValueError):
        log.warning("drive time lookup failed")
        raise fail(Code.UNAVAILABLE, TRY_LATER) from None
    if summary is None:
        raise fail(Code.NOT_FOUND, "We couldn't find a driving route to that place.")
    minutes, miles = summary
    log.info("drive time estimated")
    return {"minutes": minutes, "miles": miles}
