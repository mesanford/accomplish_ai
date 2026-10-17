"""iCalendar (RFC 5545) text for the calendar feeds. Pure functions.

Timed events are written in UTC, so no VTIMEZONE block is needed and every calendar app shows the right local time.
All-day events use DATE values with an exclusive end day. Nothing here ever holds a Scout's name or other personal data.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

PRODID = "-//Forthright//Troop calendar//EN"
CRLF = "\r\n"


def escape_text(value: str) -> str:
    """Escape a TEXT value: backslash, semicolon, comma and line breaks."""
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line: str) -> str:
    """Split a content line into lines of at most 75 octets, breaking only between characters."""
    out, current, size = [], "", 0
    for ch in line:
        width = len(ch.encode("utf-8"))
        limit = 75 if not out else 74  # a continuation line starts with one space
        if size + width > limit:
            out.append(current)
            current, size = "", 0
        current += ch
        size += width
    out.append(current)
    return (CRLF + " ").join(out)


def _day(d: date) -> str:
    return f"{d:%Y%m%d}"


def _utc(d: datetime) -> str:
    return f"{d.astimezone(UTC):%Y%m%dT%H%M%SZ}"


def when_lines(entry: dict, zone: ZoneInfo | None) -> list[str]:
    """DTSTART and DTEND for one entry: {start: date, end: date | None, start_time, end_time}."""
    start, end = entry["start"], entry.get("end") or entry["start"]
    begin: time | None = entry.get("start_time")
    if begin is None:
        return [f"DTSTART;VALUE=DATE:{_day(start)}", f"DTEND;VALUE=DATE:{_day(max(end, start) + timedelta(days=1))}"]
    first = datetime.combine(start, begin, tzinfo=zone or UTC)
    finish = entry.get("end_time")
    if finish is not None:
        last = datetime.combine(max(end, start), finish, tzinfo=zone or UTC)
    elif end > start:
        last = datetime.combine(end + timedelta(days=1), time(0, 0), tzinfo=zone or UTC)
    else:
        last = first + timedelta(hours=1)
    if last <= first:
        last = first + timedelta(hours=1)
    return [f"DTSTART:{_utc(first)}", f"DTEND:{_utc(last)}"]


def event_lines(entry: dict, stamp: datetime, zone: ZoneInfo | None) -> list[str]:
    lines = ["BEGIN:VEVENT", f"UID:{entry['uid']}", f"DTSTAMP:{_utc(stamp)}", *when_lines(entry, zone)]
    lines.append(f"SUMMARY:{escape_text(entry['title'])}")
    if entry.get("place"):
        lines.append(f"LOCATION:{escape_text(entry['place'])}")
    if entry.get("description"):
        lines.append(f"DESCRIPTION:{escape_text(entry['description'])}")
    if entry.get("url"):
        lines.append(f"URL:{entry['url']}")
    lines += ["STATUS:CONFIRMED", "TRANSP:TRANSPARENT" if entry.get("start_time") is None else "TRANSP:OPAQUE"]
    lines.append("END:VEVENT")
    return lines


def build_calendar(name: str, entries: list[dict], stamp: datetime, zone: ZoneInfo | None) -> str:
    """A complete VCALENDAR document with CRLF line endings."""
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:{PRODID}", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
    lines.append(f"X-WR-CALNAME:{escape_text(name)}")
    if zone is not None:
        lines.append(f"X-WR-TIMEZONE:{zone.key}")
    lines += ["REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"]
    for entry in entries:
        lines += event_lines(entry, stamp, zone)
    lines.append("END:VCALENDAR")
    return CRLF.join(fold(line) for line in lines) + CRLF
