"""A council's public calendar feed (iCalendar, the format behind "Subscribe" and Google Calendar's public links).
Pure functions, no network or Firestore.

A leader pastes the council's feed link on Troop settings; it is kept for the troop and shared with other troops in
the same council, who are offered it. The feed is read once a day and its upcoming events are shown read-only
next to the troop's own calendar. Nothing is copied onto the troop's calendar. A repeating event shows its first
date only, marked as repeating.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from handlers.membership import InvalidInput

MAX_URL = 500
MAX_EVENTS = 400
HORIZON_DAYS = 460  # a little over the year view's 12 months
DEFAULT_ZONE = "America/Chicago"
NOT_A_FEED = "That link isn't a calendar feed. Use the link from the calendar's Subscribe or iCal button."


def feed_url(raw) -> str:
    """The feed's address, https only. A webcal:// link (what Subscribe buttons often give) is the same address."""
    url = raw.strip() if isinstance(raw, str) else ""
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://") :]
    parts = urlparse(url)
    if not url or len(url) > MAX_URL or parts.scheme != "https" or not parts.hostname or parts.username:
        raise InvalidInput("Paste the calendar's feed link. It starts with https:// or webcal://.")
    return url


def council_key(council: str | None) -> str | None:
    """How a council is matched between troops: its name in lowercase, letters and digits only, "council" left off
    so "Bay-Lakes Council" and "Bay Lakes" match."""
    words = re.findall(r"[a-z0-9]+", (council or "").lower())
    words = [w for w in words if w not in ("council", "bsa", "scouting", "america", "of", "the")]
    return "-".join(words)[:80] or None


def _lines(text: str) -> list[str]:
    """Content lines, with folded lines (a line break then a space or tab) joined back."""
    return re.sub(r"\r?\n[ \t]", "", text.replace("\r\n", "\n")).split("\n")


def _unescape(value: str) -> str:
    return re.sub(r"\\([\\;,nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), value).strip()


def _when(params: str, value: str, zone: ZoneInfo) -> date | None:
    """The local date of a DTSTART or DTEND value: a date, a floating or TZID time, or a UTC time (shown in the
    feed's zone)."""
    m = re.match(r"(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})?(Z)?)?$", value.strip())
    if not m:
        return None
    day = date(int(m[1]), int(m[2]), int(m[3]))
    if m[4] and m[8]:
        moment = datetime(day.year, day.month, day.day, int(m[5]), int(m[6]), tzinfo=ZoneInfo("UTC"))
        return moment.astimezone(zone).date()
    return day


def _zone(lines: list[str]) -> ZoneInfo:
    for line in lines:
        if line.upper().startswith("X-WR-TIMEZONE:"):
            try:
                return ZoneInfo(line.split(":", 1)[1].strip())
            except (ZoneInfoNotFoundError, ValueError):
                break
    return ZoneInfo(DEFAULT_ZONE)


def parse(text: str, today: date) -> list[dict]:
    """Upcoming events: {title, start, end (last day, or None), place, url, repeats}, soonest first."""
    if "BEGIN:VCALENDAR" not in (text or "")[:2000].upper():
        raise InvalidInput(NOT_A_FEED)
    lines = _lines(text)
    zone, events, current = _zone(lines), [], None
    for line in lines:
        if line.upper() == "BEGIN:VEVENT":
            current = {}
        elif line.upper() == "END:VEVENT" and current is not None:
            events.append(current)
            current = None
        elif current is not None and ":" in line:
            head, value = line.split(":", 1)
            name, _, params = head.partition(";")
            current[name.upper()] = (params.upper(), value)
    out = []
    for e in events:
        start = _when(*e.get("DTSTART", ("", "")), zone)
        if start is None or "STATUS" in e and e["STATUS"][1].strip().upper() == "CANCELLED":
            continue
        end = _when(*e["DTEND"], zone) if "DTEND" in e else None
        if end and "T" not in e["DTEND"][1]:
            end -= timedelta(days=1)  # an all-day event's DTEND is the day after it ends
        end = end if end and end > start else None
        if (end or start) < today or start > today + timedelta(days=HORIZON_DAYS):
            continue
        out.append(
            {
                "title": _unescape(e.get("SUMMARY", ("", "Council event"))[1])[:120] or "Council event",
                "start": start.isoformat(),
                "end": end.isoformat() if end else None,
                "place": _unescape(e.get("LOCATION", ("", ""))[1])[:120],
                "url": e["URL"][1].strip()[:500] if "URL" in e and e["URL"][1].strip().startswith("https://") else None,
                "repeats": "RRULE" in e,
            }
        )
    out.sort(key=lambda x: (x["start"], x["title"]))
    return out[:MAX_EVENTS]
