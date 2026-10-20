"""The data retention schedule: what is due for deletion on a given day. No Firestore calls here.

The schedule (the privacy policy states it in plain words):
- A Scout's records: 12 months after the Scout left the troop (`leftAt` on the member) or turned 18, whichever
  comes first. Only the birth month and year are known, so a Scout counts as 18 from the first day of the month
  after their 18th birthday month. A Scout with missing or unreadable birth data is never deleted by the age rule.
- A conversation: 24 months after its last message.
- An announcement or newsletter: 24 months after it was posted.
- A "Join us" request (lead): 12 months after it was sent.
- A daily draft counter (`usage`): more than 30 days after its day.
- A whole troop: 18 months after anyone in it last used the app (see `endpoints/activity.py`).
- A Scout account entry: 7 years after its date, even after the Scout was removed (their entries are anonymized
  then; see `handlers/ledger_lifecycle.py`).

"N months after" a date is the same day N months later. When that day doesn't exist (31 March + 1 month,
29 February + 12 months), it is the first day of the following month, so records are kept a little longer rather
than deleted early. Something is due on that day and every day after it.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

SCOUT_MONTHS = 12
THREAD_MONTHS = 24
LEAD_MONTHS = 12
ANNOUNCEMENT_MONTHS = 24
USAGE_DAYS = 30
TROOP_MONTHS = 18
ADULT_AGE = 18
TIMEZONE = ZoneInfo("America/Chicago")  # the schedule runs and counts days in US Central time
_DRY_RUN_OFF = {"0", "false", "off", "no"}


def add_months(day: date, months: int) -> date:
    """The same day `months` later (or earlier, if negative); the 1st of the next month if that day is missing."""
    index = day.year * 12 + (day.month - 1) + months
    year, month = divmod(index, 12)
    try:
        return date(year, month + 1, day.day)
    except ValueError:
        return date(year + (month + 1) // 12, (month + 1) % 12 + 1, 1)


def is_due(event: date | None, months: int, today: date) -> bool:
    return event is not None and add_months(event, months) <= today


def local_date(value, zone: ZoneInfo | None = None) -> date | None:
    """A Firestore timestamp (a datetime) as a calendar date in `zone` (a troop's own time zone; US Central when not
    given). Anything else is unknown (None)."""
    if isinstance(value, datetime):
        aware = value if value.tzinfo else value.replace(tzinfo=UTC)
        return aware.astimezone(zone or TIMEZONE).date()
    if isinstance(value, date):
        return value
    return None


def today_local(now: datetime | None = None, zone: ZoneInfo | None = None) -> date:
    """Today in `zone`. Code acting for one troop passes that troop's zone (see `fb.troop_today`)."""
    return local_date(now or datetime.now(UTC), zone)


def query_cutoff(today: date, months: int) -> datetime:
    """A timestamp later than every due event, for a Firestore `<` filter. The planner then checks each document
    exactly, so this may let a few not-yet-due documents through but never leaves a due one out."""
    start = add_months(today, -months) + timedelta(days=2)
    return datetime(start.year, start.month, start.day, tzinfo=TIMEZONE)


def adult_from(record: dict | None, today: date) -> date | None:
    """The first day of the month after the Scout's 18th birthday month, or None when the birth data is missing,
    not whole numbers, or impossible (a month outside 1 to 12, a year in the future or before 1900)."""
    record = record or {}
    year, month = record.get("birthYear"), record.get("birthMonth")
    if type(year) is not int or type(month) is not int:  # bool is an int subclass; refuse it too
        return None
    if not 1 <= month <= 12 or not 1900 <= year <= today.year:
        return None
    return add_months(date(year + ADULT_AGE, month, 1), 1)


def scout_due(member: dict, record: dict | None, today: date) -> str | None:
    """Why this Scout's records are due today ("left" or "age"), or None if they are not. Only Scouts qualify."""
    if (member or {}).get("kind") != "scout":
        return None
    left = local_date(member.get("leftAt"))
    adult = adult_from(record, today)
    left_due = add_months(left, SCOUT_MONTHS) if left else None
    age_due = add_months(adult, SCOUT_MONTHS) if adult else None
    dues = [(d, why) for d, why in ((left_due, "left"), (age_due, "age")) if d is not None and d <= today]
    return min(dues)[1] if dues else None


def plan_scouts(members: dict[str, dict], records: dict[str, dict], today: date) -> list[tuple[str, str]]:
    """[(scout id, reason)] due today, in id order so a bounded run and its rerun take the same ones first."""
    due = []
    for scout_id in sorted(members):
        reason = scout_due(members[scout_id], records.get(scout_id), today)
        if reason:
            due.append((scout_id, reason))
    return due


def thread_last_date(thread: dict) -> date | None:
    """When the conversation last had a message: `updatedAt` (set on every message), else `createdAt`."""
    return local_date(thread.get("updatedAt")) or local_date(thread.get("createdAt"))


def thread_due(thread: dict, newest_message_at, today: date) -> bool:
    """Due only if both the thread and its newest message are old enough. A thread whose dates are all unknown is
    kept (and logged by the caller), never guessed at."""
    last = thread_last_date(thread)
    newest = local_date(newest_message_at)
    if last is None and newest is None:
        return False
    return all(is_due(d, THREAD_MONTHS, today) for d in (last, newest) if d is not None)


def lead_due(lead: dict, today: date) -> bool:
    return is_due(local_date(lead.get("createdAt")), LEAD_MONTHS, today)


def announcement_due(announcement: dict, today: date) -> bool:
    """24 months after it was posted, whether or not it was edited since."""
    return is_due(local_date(announcement.get("createdAt")), ANNOUNCEMENT_MONTHS, today)


def usage_day(doc_id: str) -> date | None:
    """The day in a counter id: `{uid}_{day}`, `about_{uid}_{day}` or `leads_{day}`."""
    try:
        return date.fromisoformat(doc_id.rsplit("_", 1)[-1])
    except ValueError:
        return None


def plan_usage(doc_ids: list[str], today: date, limit: int) -> list[str]:
    old = [i for i in doc_ids if (day := usage_day(i)) is not None and (today - day).days > USAGE_DAYS]
    return sorted(old)[:limit]


def troop_last_active(troop_doc: dict) -> date | None:
    """The later of `lastActiveAt` (someone used the app) and `activityTrackedSince` (when tracking began for
    this troop; troops made before tracking existed get their clock started then, never backdated)."""
    dates = [local_date(troop_doc.get(k)) for k in ("lastActiveAt", "activityTrackedSince")]
    known = [d for d in dates if d is not None]
    return max(known) if known else None


def troop_due(troop_doc: dict, today: date) -> bool:
    return is_due(troop_last_active(troop_doc), TROOP_MONTHS, today)


def dry_run(value: str | None) -> bool:
    """Whole-troop deletion only logs what it would delete unless TRAILHEAD_RETENTION_DRY_RUN is set to one of
    0, false, off or no. Unset, empty or anything else means dry run."""
    return (value or "").strip().lower() not in _DRY_RUN_OFF
