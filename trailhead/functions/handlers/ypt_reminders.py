"""Youth Protection training reminders: who is reminded and when. No Firestore calls here.

An adult is reminded 30 days and 7 days before their training expires, and on the day it lapses (the day after the
expiry date, the first day `has_current_ypt` is false). The Scoutmaster gets a weekly list of adults whose training
has lapsed or runs out within 30 days.

Idempotency: `troops/{t}/yptReminders/{memberId}` records `{expiresOn, sent: [stage, ...]}`. A stage is sent once
per expiry date. A new expiry date (the adult renewed) starts a fresh list. A person first seen late gets only the
most urgent reminder that applies, and every earlier stage is marked sent so it is not sent after it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from handlers.membership import YPT_ROLES
from handlers.roles import as_date

SOON = "30"
WEEK = "7"
LAPSED = "lapsed"
STAGES = (SOON, WEEK, LAPSED)  # least to most urgent
EXPIRING_DAYS = 30
WEEK_DAYS = 7
LAPSE_NOTICE_DAYS = 14  # a lapse notice is sent only this long after the lapse; older lapses are in the weekly list
MAX_LISTED = 50  # names in one weekly email

CURRENT, EXPIRING, LAPSED_STATUS, MISSING = "current", "expiring", "lapsed", "missing"


def needs_ypt(member: dict | None, fallback_roles: list[str] | None = None) -> bool:
    """True for a current adult with a role that needs training. Scouts, parents-only and left members do not."""
    member = member or {}
    if member.get("kind") != "adult" or member.get("leftAt"):
        return False
    return bool(YPT_ROLES & set(member.get("roles") or fallback_roles or []))


def status_of(expires: date | None, today: date) -> str:
    """current, expiring (within 30 days, counting the expiry day), lapsed or missing."""
    if expires is None:
        return MISSING
    if expires < today:
        return LAPSED_STATUS
    return EXPIRING if (expires - today).days <= EXPIRING_DAYS else CURRENT


def reached(expires: date | None, today: date) -> list[str]:
    """The stages whose moment has come and whose message still makes sense, least urgent first."""
    if expires is None:
        return []
    left = (expires - today).days
    if left >= 0:
        return [s for s, limit in ((SOON, EXPIRING_DAYS), (WEEK, WEEK_DAYS)) if left <= limit]
    return [LAPSED] if -left <= LAPSE_NOTICE_DAYS else []


@dataclass(frozen=True)
class Plan:
    stage: str | None  # the reminder to send now, or None
    record: dict | None  # the new `yptReminders` document to save before sending, or None when nothing changes


def plan_member(expires: date | None, today: date, record: dict | None) -> Plan:
    """What to do for one adult today, given their reminder record."""
    due = reached(expires, today)
    if expires is None or not due:
        return Plan(None, None)
    iso = expires.isoformat()
    sent = list((record or {}).get("sent") or []) if (record or {}).get("expiresOn") == iso else []
    if due[-1] in sent:
        return Plan(None, None)
    return Plan(due[-1], {"expiresOn": iso, "sent": [s for s in STAGES if s in {*sent, *due}]})


def week_start(today: date) -> date:
    return today - timedelta(days=today.weekday())


def digest_due(today: date, record: dict | None) -> bool:
    """True once per week (the first run of each Monday-to-Sunday week)."""
    return (record or {}).get("weekOf") != week_start(today).isoformat()


def digest_record(today: date) -> dict:
    return {"weekOf": week_start(today).isoformat()}


def attention(members: dict[str, dict], today: date, access_roles: dict[str, list[str]] | None = None) -> list[dict]:
    """Adults whose training has lapsed, is missing or ends within 30 days, most urgent first.

    Returns `{"name", "status", "expires"}` rows. `members`: member id -> member doc.
    """
    rows = []
    for member_id, member in members.items():
        if not needs_ypt(member, (access_roles or {}).get(member_id)):
            continue
        expires = as_date(member.get("yptExpiresAt"))
        status = status_of(expires, today)
        if status != CURRENT:
            rows.append({"name": member.get("displayName") or "A member", "status": status, "expires": expires})
    order = {MISSING: 0, LAPSED_STATUS: 1, EXPIRING: 2}
    far = date.max
    return sorted(rows, key=lambda r: (order[r["status"]], r["expires"] or far, r["name"].lower()))
