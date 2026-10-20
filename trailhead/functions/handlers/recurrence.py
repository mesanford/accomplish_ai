"""Repeating events, such as the weekly troop meeting. Pure functions, no network or Firestore.

A series is stored as ordinary events, one per date, that share a `seriesId`. Each date then has its own sign-ups,
attendance, reminder and cancellation, and everything that works for one event works for each meeting.
"""

from __future__ import annotations

import re
from datetime import date, timedelta

from handlers.membership import InvalidInput
from handlers.signup_config import as_date, parse_clock

WEEKLY, BIWEEKLY, MONTHLY = "weekly", "biweekly", "monthly"
PATTERNS = (WEEKLY, BIWEEKLY, MONTHLY)
MAX_DATES = 52
MAX_SPAN_DAYS = 366
MAX_TITLE, MAX_PLACE = 120, 120
ORDINALS = ("1st", "2nd", "3rd", "4th", "5th")
DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def nth_weekday(d: date) -> int:
    """1 for the first Tuesday of its month, 2 for the second, and so on."""
    return (d.day - 1) // 7 + 1


def _monthly(first: date, until: date) -> list[date]:
    n, out = nth_weekday(first), []
    year, month = first.year, first.month
    while True:
        start_of_month = date(year, month, 1)
        if start_of_month > until:
            return out
        offset = (first.weekday() - start_of_month.weekday()) % 7
        candidate = start_of_month + timedelta(days=offset + 7 * (n - 1))
        if candidate.month == month and first <= candidate <= until:  # a month without a 5th Tuesday is skipped
            out.append(candidate)
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)


def dates_for(pattern: str, first: date, until: date) -> list[date]:
    """Every date of the series, `first` included. Raises InvalidInput for a request that can't be met."""
    if pattern not in PATTERNS:
        raise InvalidInput("Choose how often the event repeats.")
    if until < first:
        raise InvalidInput("The last date can not be before the first.")
    if (until - first).days > MAX_SPAN_DAYS:
        raise InvalidInput("A repeating event can run for up to a year. Add another series after that.")
    if pattern == MONTHLY:
        out = _monthly(first, until)
    else:
        step = timedelta(weeks=1 if pattern == WEEKLY else 2)
        out, d = [], first
        while d <= until:
            out.append(d)
            d += step
    if len(out) > MAX_DATES:
        raise InvalidInput(f"That makes {len(out)} dates. A series can have up to {MAX_DATES}.")
    return out


def label(pattern: str, first: date) -> str:
    """ "Every Tuesday", "Every other Tuesday" or "The 2nd Tuesday of each month"."""
    day = DAYS[first.weekday()]
    if pattern == WEEKLY:
        return f"Every {day}"
    if pattern == BIWEEKLY:
        return f"Every other {day}"
    return f"The {ORDINALS[nth_weekday(first) - 1]} {day} of each month"


def _text(raw, limit: int, what: str, required: bool = False) -> str:
    value = raw.strip() if isinstance(raw, str) else ""
    if required and not value:
        raise InvalidInput(f"Enter the {what}.")
    if len(value) > limit:
        raise InvalidInput(f"The {what} can be up to {limit} characters.")
    return value


def _clock(raw, what: str) -> str | None:
    if raw in (None, ""):
        return None
    if not isinstance(raw, str) or parse_clock(raw) is None or not re.fullmatch(r"\d\d:\d\d", raw):
        raise InvalidInput(f"Enter the {what} as a time, such as 19:00.")
    return raw


def details(data: dict, partial: bool = False) -> dict:
    """The shared details of every date, from a request. With `partial`, only the keys present are checked and
    returned (a series update); a missing time or place is then "no change", and an empty one clears it."""
    out: dict = {}
    if not partial or "title" in data:
        out["title"] = _text(data.get("title"), MAX_TITLE, "event's name", required=True)
    if not partial or "place" in data:
        out["place"] = _text(data.get("place"), MAX_PLACE, "place")
    for key, what in (("startTime", "start time"), ("endTime", "end time")):
        if not partial or key in data:
            out[key] = _clock(data.get(key), what)
    start, end = out.get("startTime"), out.get("endTime")
    if start and end and end <= start:
        raise InvalidInput("The end time needs to be after the start time.")
    if not partial:
        out["public"] = data.get("public") is True
    return out


def request(data: dict) -> tuple[str, date, date]:
    """(pattern, first, until) from a create request."""
    first, until = as_date(data.get("start")), as_date(data.get("until"))
    if first is None:
        raise InvalidInput("Enter the first date.")
    if until is None:
        raise InvalidInput("Enter the last date the event repeats.")
    pattern = data.get("pattern")
    dates_for(pattern, first, until)
    return pattern, first, until
