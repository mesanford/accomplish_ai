"""Telling families when an event moves, changes place or is cancelled. Pure functions, no network or Firestore.

The alert fires from a trigger on the event document, because leaders write events directly. `alertedFor` (server
only) holds the signature of the details families were last told about, so a retry, a second trigger run or a change
already announced by a series update never sends twice.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta

from handlers.signup_config import as_date, parse_clock
from trailhead_core.dates import human

# The details families plan around. A new title alone is not worth an email.
WATCHED = ("start", "endDate", "startTime", "endTime", "place", "cancelled")
# Without sign-ups there is no list of who is coming, so the whole troop hears, but only about events this close.
TROOP_ALERT_DAYS = 14
CHANGED, CANCELLED, RESTORED = "changed", "cancelled", "restored"


@dataclass(frozen=True)
class Change:
    kind: str
    lines: list[str]  # what changed, for the email, such as "New date: Oct 24, 2026 (was Oct 23, 2026)."


def signature(event: dict) -> str:
    values = {key: event.get(key) for key in WATCHED}
    values["cancelled"] = event.get("cancelled") is True
    return json.dumps(values, sort_keys=True, default=str)


def clock(value) -> str | None:
    """ "19:30" as "7:30 pm"."""
    t = parse_clock(value)
    if t is None:
        return None
    hour = t.hour % 12 or 12
    return f"{hour}:{t.minute:02d} {'am' if t.hour < 12 else 'pm'}"


def _day(value) -> str | None:
    d = as_date(value)
    return human(d) if d else None


def _times(event: dict) -> str | None:
    start, end = clock(event.get("startTime")), clock(event.get("endTime"))
    if start and end:
        return f"{start} to {end}"
    return start


def _place(event: dict) -> str | None:
    place = event.get("place")
    return place.strip() if isinstance(place, str) and place.strip() else None


def _line(label: str, new: str | None, old: str | None) -> str | None:
    if new == old:
        return None
    if new is None:
        return f"{label}: none any more (was {old})."
    return f"{label}: {new} (was {old})." if old else f"{label}: {new}."


def describe(before: dict, after: dict) -> list[str]:
    """One line per detail that changed, in the words a parent reads."""
    lines = [
        _line("New date", _day(after.get("start")), _day(before.get("start"))),
        _line("Last day", _day(after.get("endDate")), _day(before.get("endDate"))),
        _line("Time", _times(after), _times(before)),
        _line("Place", _place(after), _place(before)),
    ]
    return [line for line in lines if line]


def change_of(before: dict | None, after: dict | None, today: date) -> Change | None:
    """What families should hear about this write, or None. Creating or deleting an event, a past event and a write
    whose details were already announced say nothing."""
    if before is None or after is None:
        return None
    if signature(after) in (signature(before), after.get("alertedFor")):
        return None
    dates = [d for d in (as_date(before.get("start")), as_date(after.get("start"))) if d]
    if not dates or max(dates) < today:
        return None
    was, now = before.get("cancelled") is True, after.get("cancelled") is True
    if now and not was:
        return Change(CANCELLED, [])
    if was and not now:
        return Change(RESTORED, describe(before, after))
    if now:
        return None  # details of a cancelled event changing are nobody's news
    lines = describe(before, after)
    return Change(CHANGED, lines) if lines else None


def whole_troop(event: dict, today: date) -> bool:
    """True when nobody signed up because sign-ups are off, and the event is soon enough to tell everyone."""
    if (event.get("signups") or {}).get("enabled") is True:
        return False
    start = as_date(event.get("start"))
    return start is not None and today <= start <= today + timedelta(days=TROOP_ALERT_DAYS)


def headline(kind: str, title: str, when: str | None) -> str:
    """The first line of the email and the subject's meaning."""
    on = f" on {when}" if when else ""
    if kind == CANCELLED:
        return f"{title}{on} is cancelled."
    if kind == RESTORED:
        return f"{title}{on} is back on."
    return f"{title} has changed."
