"""Calendar feeds (ICS) that Google, Apple and Outlook calendars subscribe to.

Member feed: /cal/{token}.ics. The token is 256 random bits, stored in `calendarFeeds/{token}` (server-only) and in
`troops/{t}/calendarTokens/{uid}` (server-only) so the member can see it again. Resetting makes a new token and deletes
the old document, so the old URL stops working at once. A feed also stops when the person leaves the troop.
Public feed: /cal/site/{slug}.ics, built only from the public events already on the troop's published website.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_functions import https_fn

from endpoints.erase import delete_op
from endpoints.mailer import app_url
from fb import db, require_access, troop
from handlers.calendar_feed import member_entries, new_token, parse_path, public_entries
from handlers.ics import build_calendar
from handlers.signups import troop_zone

log = logging.getLogger(__name__)
NOT_FOUND = ("Not found", 404, {"Content-Type": "text/plain; charset=utf-8"})


def issue_token(troop_id: str, uid: str, reset: bool = False) -> str:
    """The member's feed token, made on first use. With `reset`, a new one replaces the old for good."""
    ref = troop(troop_id).collection("calendarTokens").document(uid)
    current = (ref.get().to_dict() or {}).get("token")
    if current and not reset:
        return current
    token, now = new_token(), datetime.now(UTC)
    batch = db().batch()
    if current:
        batch.delete(db().collection("calendarFeeds").document(current))
    batch.set(db().collection("calendarFeeds").document(token), {"troopId": troop_id, "uid": uid, "createdAt": now})
    batch.set(ref, {"token": token, "createdAt": now})
    batch.commit()
    return token


def cleanup_ops(t, uid: str) -> list:
    """Deletes for a person's feed token when they leave the troop (so no orphaned address is left behind)."""
    ref = t.collection("calendarTokens").document(uid)
    token = (ref.get().to_dict() or {}).get("token")
    ops = [delete_op(ref)]
    if token:
        ops.append(delete_op(db().collection("calendarFeeds").document(token)))
    return ops


def feed_paths(troop_id: str, token: str) -> dict:
    slug = ((troop(troop_id).get().to_dict() or {}).get("site") or {}).get("slug")
    published = bool(slug) and db().collection("publicSites").document(slug).get().exists
    return {"path": f"/cal/{token}.ics", "publicPath": f"/cal/site/{slug}.ics" if published else None}


@https_fn.on_call()
def get_calendar_feed(req: https_fn.CallableRequest) -> dict:
    """The caller's private feed path (and the public one if the troop has a website). Any troop member."""
    troop_id = (req.data or {}).get("troopId")
    require_access(req, troop_id)
    return feed_paths(troop_id, issue_token(troop_id, req.auth.uid))


@https_fn.on_call()
def reset_calendar_feed(req: https_fn.CallableRequest) -> dict:
    """Make a new private feed address. Calendars using the old one stop updating."""
    troop_id = (req.data or {}).get("troopId")
    require_access(req, troop_id)
    return feed_paths(troop_id, issue_token(troop_id, req.auth.uid, reset=True))


def _headers(private: bool) -> dict:
    cache = "private, max-age=900" if private else "public, max-age=3600"
    return {"Content-Type": "text/calendar; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff"}


def member_feed(token: str, now: datetime):
    found = db().collection("calendarFeeds").document(token).get().to_dict()
    if not found:
        return NOT_FOUND
    troop_id, uid = found["troopId"], found["uid"]
    t = troop(troop_id)
    if not t.collection("access").document(uid).get().exists:
        return NOT_FOUND
    troop_doc = t.get().to_dict() or {}
    zone = troop_zone(troop_doc)
    events = [(d.id, d.to_dict() or {}) for d in t.collection("events").stream()]
    today = (now.astimezone(zone) if zone else now).date()
    entries = member_entries(events, troop_id, app_url(), today)
    name = f"{troop_doc.get('name', 'Troop')} events"
    return build_calendar(name, entries, now, zone), 200, _headers(private=True)


def site_feed(slug: str, now: datetime):
    site = db().collection("publicSites").document(slug).get().to_dict()
    if not site:
        return NOT_FOUND
    entries = public_entries(site.get("events") or [], slug)
    name = f"{(site.get('troopName') or 'Troop')} events"
    return build_calendar(name, entries, now, troop_zone(None)), 200, _headers(private=False)


@https_fn.on_request()
def calendar_feed(req: https_fn.Request):
    """GET /cal/{token}.ics or /cal/site/{slug}.ics. Anything that doesn't match answers the same 404."""
    parsed = parse_path(req.path)
    if req.method not in ("GET", "HEAD") or parsed is None:
        return NOT_FOUND
    now = datetime.now(UTC)
    try:
        return member_feed(parsed[1], now) if parsed[0] == "member" else site_feed(parsed[1], now)
    except Exception:
        log.exception("calendar feed failed")
        return ("Something went wrong", 500, {"Content-Type": "text/plain; charset=utf-8"})
