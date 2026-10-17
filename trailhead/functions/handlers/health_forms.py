"""Health form dates (BSA Annual Health and Medical Record): who may record one and what a record looks like.

Only dates are stored, never medical details or files. `troops/{t}/healthForms/{memberId}` holds
`{partsAB: {date, byMemberId, at}, partC: {date, byMemberId, at}}`. Parts A and B are one date; Part C (the physical)
has its own. A form is good for 12 months, through the same day a year later; the screens work out the status.
No Firestore calls here.
"""

from __future__ import annotations

from datetime import date, timedelta

from handlers.account import LEADER_ROLES
from handlers.membership import InvalidInput
from handlers.roles import acts_for

PARTS = ("partsAB", "partC")
EARLIEST = date(2000, 1, 1)


def can_record(access: dict, member_id: str) -> bool:
    """Leaders for anyone; a person for themselves; a Scout's linked parent (or the Scout) for the Scout."""
    return (
        bool(LEADER_ROLES & set(access.get("roles", [])))
        or access.get("memberId") == member_id
        or acts_for(access, member_id)
    )


def parse_record(data: dict, today: date) -> tuple[str, str]:
    """(part, ISO date) from a request, or InvalidInput. The date can't be in the future (a day of slack covers time
    zones ahead of UTC) or before 2000."""
    part = data.get("part")
    if part not in PARTS:
        raise InvalidInput("Choose Parts A and B, or Part C.")
    raw = data.get("date")
    try:
        day = date.fromisoformat(raw) if isinstance(raw, str) and len(raw) == 10 else None
    except ValueError:
        day = None
    if day is None:
        raise InvalidInput("Enter the date on the form as YYYY-MM-DD.")
    if day > today + timedelta(days=1):
        raise InvalidInput("The date can not be in the future.")
    if day < EARLIEST:
        raise InvalidInput("That date is too long ago.")
    return part, day.isoformat()


def entry(date_iso: str, by_member_id: str, at) -> dict:
    return {"date": date_iso, "byMemberId": by_member_id, "at": at}
