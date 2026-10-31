"""Council calendar feeds. A leader saves the council's feed link (set_council_calendar); it is kept on the troop and
shared by council in councilFeeds/{council}, so other troops in the council are offered it. The feed is read when
saved and every morning after (refresh_council_calendars) into councilEvents/{council}, which the year at a glance
shows read-only. See handlers/council_calendar.py.

The link is typed by a person, so it is fetched carefully: https only, public internet addresses only (never this
project's own network), at most a few redirects, each checked, and a size and time limit.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
import urllib.error
import urllib.request
from datetime import UTC, datetime
from urllib.parse import urljoin, urlparse

from firebase_admin import firestore
from firebase_functions import https_fn, scheduler_fn

from fb import db, fail, require_leader, troop, troop_today
from handlers import council_calendar as cc
from handlers.membership import InvalidInput

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
MAX_BYTES = 3_000_000
MAX_REDIRECTS = 4
AGENT = {"User-Agent": "Forthright/1.0 (+https://forthrightapp.com)", "Accept": "text/calendar, */*"}


class _Stop(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def _public(url: str) -> bool:
    """https, and every address the name points to is on the public internet."""
    host = urlparse(url).hostname or ""
    if urlparse(url).scheme != "https" or not host:
        return False
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


def fetch_feed(url: str) -> str:
    opener = urllib.request.build_opener(_Stop)
    for _ in range(MAX_REDIRECTS + 1):
        if not _public(url):
            raise InvalidInput("That address can't be read. Use the calendar's public https:// or webcal:// link.")
        try:
            with opener.open(urllib.request.Request(url, headers=AGENT), timeout=20) as r:
                body = r.read(MAX_BYTES + 1)
        except urllib.error.HTTPError as err:
            if 300 <= err.code < 400 and err.headers.get("Location"):
                url = urljoin(url, err.headers["Location"])
                continue
            raise InvalidInput(f"The calendar's site answered with an error ({err.code}). Check the link.") from err
        if len(body) > MAX_BYTES:
            raise InvalidInput("That calendar is too large to read.")
        return body.decode("utf-8", "replace")
    raise InvalidInput("That link redirects too many times.")


def _store(key: str, url: str, events: list[dict], council: str, troop_id: str | None) -> None:
    now = firestore.SERVER_TIMESTAMP
    db().collection("councilEvents").document(key).set({"events": events, "fetchedAt": now, "url": url})
    feed = {"url": url, "council": council, "updatedAt": now, "lastError": None}
    if troop_id:
        feed["savedByTroopId"] = troop_id
    db().collection("councilFeeds").document(key).set(feed, merge=True)


@https_fn.on_call(timeout_sec=60)
def set_council_calendar(req: https_fn.CallableRequest) -> dict:
    """`{troopId, url}` saves the council's feed (checked by reading it); `url` empty removes it from the troop."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_leader(req, troop_id)
    t = troop(troop_id)
    if not data.get("url"):
        t.update({"councilCalendar": firestore.DELETE_FIELD})
        return {"saved": True}
    council = ((t.get().to_dict() or {}).get("council") or "").strip()
    key = cc.council_key(council)
    if not key:
        raise fail(Code.FAILED_PRECONDITION, "Add your council's name on Troop settings first.")
    try:
        url = cc.feed_url(data.get("url"))
        events = cc.parse(fetch_feed(url), troop_today(troop_id))
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    _store(key, url, events, council, troop_id)
    t.update({"councilCalendar": {"url": url, "key": key, "savedAt": firestore.SERVER_TIMESTAMP}})
    log.info("council calendar saved events=%d", len(events))
    return {"saved": True, "events": len(events)}


def refresh_all(now: datetime | None = None, fetch=fetch_feed) -> int:
    """Read every shared feed again. A feed that fails keeps its last events and notes the problem."""
    today, done = (now or datetime.now(UTC)).date(), 0
    for snap in db().collection("councilFeeds").stream():
        feed = snap.to_dict() or {}
        try:
            events = cc.parse(fetch(feed["url"]), today)
        except Exception as err:  # noqa: BLE001 - one bad feed must not stop the others
            snap.reference.update({"lastError": str(err)[:200], "lastErrorAt": firestore.SERVER_TIMESTAMP})
            continue
        _store(snap.id, feed["url"], events, feed.get("council", ""), None)
        done += 1
    return done


@scheduler_fn.on_schedule(schedule="0 4 * * *", timezone=scheduler_fn.Timezone("America/Chicago"), timeout_sec=540)
def refresh_council_calendars(event: scheduler_fn.ScheduledEvent) -> None:
    log.info("council calendars refreshed=%d", refresh_all())
