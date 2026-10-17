"""Asking a Scout's parents for consent by email. No Firestore calls here.

A request (troops/{t}/consentRequests/{scoutId}) lists up to four parents or guardians the troop gave us an email for:
    {"parents": [{"pid", "name", "email", "code", "status", "sentCount", "firstSentAt", "lastSentAt"}],
     "kind", "deletesScout", "createdAt", "deleteAfter"}
`status` is "emailed" (waiting), "agreed", "declined" or "noAnswer". One parent agreeing gives the Scout consent.
"""

from __future__ import annotations

import re
import secrets
from datetime import date, datetime, timedelta

from handlers.membership import InvalidInput, under_13

MAX_PARENTS = 4
WAIT_DAYS = 30  # a Scout nobody answers for is deleted after this
MAX_EMAILS = 4  # per parent, per request (and per notice version, for out-of-date parents)
EMAIL_GAP_DAYS = 7
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
EMAILED, AGREED, DECLINED, NO_ANSWER = "emailed", "agreed", "declined", "noAnswer"


def needs_parent_consent(record: dict | None, today: date) -> bool:
    """True if only a parent may consent for this Scout: under 13, or the birth month or year is unknown."""
    if not record or not isinstance(record.get("birthYear"), int) or not isinstance(record.get("birthMonth"), int):
        return True
    return under_13(record, today)


def clean_parents(raw) -> list[dict]:
    """Validate the parents a leader typed: one to four, each with a name and an email, no email twice."""
    if not isinstance(raw, list) or not raw:
        raise InvalidInput("Enter a parent or guardian's name and email address.")
    if len(raw) > MAX_PARENTS:
        raise InvalidInput(f"Enter at most {MAX_PARENTS} parents or guardians.")
    seen, parents = set(), []
    for item in raw:
        item = item if isinstance(item, dict) else {}
        name, email = str(item.get("name") or "").strip(), str(item.get("email") or "").strip().lower()
        if not name or len(name) > 80:
            raise InvalidInput("Enter each parent or guardian's name (80 characters or fewer).")
        if not EMAIL_PATTERN.match(email) or len(email) > 120:
            raise InvalidInput(f"{name}: enter a valid email address.")
        if email in seen:
            raise InvalidInput("Each parent or guardian needs their own email address.")
        seen.add(email)
        parents.append({"name": name, "email": email})
    return parents


def new_parent(name: str, email: str, code: str) -> dict:
    return {
        "pid": secrets.token_hex(4),
        "name": name,
        "email": email,
        "code": code,
        "status": EMAILED,
        "sentCount": 0,
    }


def new_request(parents: list[dict], now: datetime, kind: str, deletes_scout: bool) -> dict:
    """`kind`: "consent" (the Scout waits for a first consent) or "invite" (the Scout already has consent and a
    leader is inviting another parent). `deletes_scout`: if nobody agrees by `deleteAfter`, the Scout is deleted too
    (only for a Scout added with this request). Otherwise only these contact details go."""
    return {
        "parents": parents,
        "kind": kind,
        "deletesScout": deletes_scout,
        "createdAt": now,
        "deleteAfter": now + timedelta(days=WAIT_DAYS),
    }


def email_due(sent_count: int, last_sent: datetime | None, now: datetime) -> bool:
    """First email at once, then one every 7 days, at most four in all."""
    if sent_count <= 0 or last_sent is None:
        return True
    return sent_count < MAX_EMAILS and now - last_sent >= timedelta(days=EMAIL_GAP_DAYS)


def gave_up(sent_count: int, last_sent: datetime | None, now: datetime) -> bool:
    """All four emails went out and a week has passed since the last one."""
    return sent_count >= MAX_EMAILS and last_sent is not None and now - last_sent >= timedelta(days=EMAIL_GAP_DAYS)


def outcome(request: dict | None) -> str:
    """ "agreed" if any parent agreed, "declined" if every parent declined, otherwise "waiting"."""
    parents = (request or {}).get("parents") or []
    if any(p.get("status") == AGREED for p in parents):
        return AGREED
    if parents and all(p.get("status") == DECLINED for p in parents):
        return DECLINED
    return "waiting"


def with_status(request: dict, pid: str, status: str) -> dict:
    parents = [{**p, "status": status} if p.get("pid") == pid else p for p in request.get("parents", [])]
    return {**request, "parents": parents}


def settle(request: dict, now: datetime) -> dict:
    """Once someone agreed, parents still "emailed" become "noAnswer" (no more reminders). Parents who never answered
    four emails also become "noAnswer"."""
    agreed = outcome(request) == AGREED
    parents = []
    for p in request.get("parents", []):
        if p.get("status") == EMAILED and (agreed or gave_up(p.get("sentCount", 0), p.get("lastSentAt"), now)):
            p = {**p, "status": NO_ANSWER}
        parents.append(p)
    return {**request, "parents": parents}


def to_email(request: dict, now: datetime) -> list[str]:
    """Parent ids to email today: still waiting, nobody has agreed, and the schedule says so."""
    if outcome(request) != "waiting":
        return []
    return [
        p["pid"]
        for p in request.get("parents", [])
        if p.get("status") == EMAILED and email_due(p.get("sentCount", 0), p.get("lastSentAt"), now)
    ]


def expired(request: dict | None, now: datetime) -> bool:
    deadline = (request or {}).get("deleteAfter")
    return bool(deadline) and deadline <= now
