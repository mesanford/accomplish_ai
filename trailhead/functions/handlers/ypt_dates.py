"""An adult entering their own Youth Protection expiry date. No Firestore calls here."""

from __future__ import annotations

from datetime import UTC, date, datetime, time

from handlers.membership import InvalidInput
from trailhead_core.dates import add_months

MAX_YEARS_AHEAD = 3
SELF = "self"  # `yptUpdatedBy` when the adult entered the date; otherwise the leader's member id


def parse_own_date(value, today: date) -> datetime:
    """The expiry date, stored the way the app stores it (that day at 23:59 UTC). Today is allowed; the past and
    anything more than three years ahead are not."""
    try:
        day = date.fromisoformat(value) if isinstance(value, str) and len(value) == 10 else None
    except ValueError:
        day = None
    if day is None:
        raise InvalidInput("Enter the expiry date as YYYY-MM-DD.")
    if day < today:
        raise InvalidInput("That date has passed. Renew your training first, then enter the new expiry date.")
    if day > add_months(today, MAX_YEARS_AHEAD * 12):
        raise InvalidInput(f"That date is more than {MAX_YEARS_AHEAD} years away. Check the date on your certificate.")
    return datetime.combine(day, time(23, 59), tzinfo=UTC)
