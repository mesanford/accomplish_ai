"""Reading an event's sign-up settings and checking what a family entered. Pure functions."""

from __future__ import annotations

import re
from datetime import date, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

AUDIENCES = ("scouts", "adults", "both")
DEFAULT_TZ = "America/Chicago"
MAX_QUESTIONS, MAX_CHOICES, LABEL_MAX, ANSWER_MAX, NOTE_MAX = 6, 10, 80, 200, 500


class SignupError(Exception):
    """A problem the person can fix. The message is safe to show."""


def as_date(value) -> date | None:
    try:
        return date.fromisoformat(value[:10]) if isinstance(value, str) else None
    except ValueError:
        return None


def troop_zone(troop_doc: dict | None) -> ZoneInfo | None:
    """The troop's own time zone if it stored a valid one, else US Central. None only if no tz data exists."""
    for name in ((troop_doc or {}).get("timezone"), DEFAULT_TZ):
        if not isinstance(name, str) or not name:
            continue
        try:
            return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError):
            continue
    return None


def _questions(raw) -> list[dict]:
    out, seen = [], set()
    for q in raw if isinstance(raw, list) else []:
        if not isinstance(q, dict):
            continue
        qid, label = q.get("id"), q.get("label")
        if not isinstance(qid, str) or not re.fullmatch(r"[a-z0-9_-]{1,20}", qid) or qid in seen:
            continue
        if not isinstance(label, str) or not label.strip():
            continue
        choices = [c.strip()[:LABEL_MAX] for c in q.get("choices", []) if isinstance(c, str) and c.strip()]
        kind = "choice" if q.get("type") == "choice" and choices else "text"
        seen.add(qid)
        item = {"id": qid, "label": label.strip()[:LABEL_MAX], "type": kind, "required": q.get("required") is True}
        if kind == "choice":
            item["choices"] = choices[:MAX_CHOICES]
        out.append(item)
    return out[:MAX_QUESTIONS]


def read_config(event: dict | None) -> dict | None:
    """The event's sign-up settings in a safe shape, or None when sign-ups are off."""
    raw = (event or {}).get("signups")
    if not isinstance(raw, dict) or raw.get("enabled") is not True:
        return None
    cap = raw.get("capacity")
    return {
        "audience": raw.get("audience") if raw.get("audience") in AUDIENCES else "both",
        "capacity": cap if isinstance(cap, int) and not isinstance(cap, bool) and cap > 0 else None,
        "deadline": as_date(raw.get("deadline")),
        "needsPermission": raw.get("needsPermission") is True,
        "closed": raw.get("closed") is True,
        "questions": _questions(raw.get("questions")),
    }


def closed_reason(config: dict, event: dict, now: datetime, zone: ZoneInfo | None) -> str | None:
    """Why families can no longer sign up, or None. The deadline day itself is still open. Leaders can still add."""
    today = now.astimezone(zone).date() if zone else now.date()
    if event.get("cancelled") is True:
        return "This event is cancelled."
    if config["closed"]:
        return "Sign-ups are closed. Ask a leader to add you."
    if config["deadline"] and today > config["deadline"]:
        return "The sign-up deadline has passed. Ask a leader to add you."
    last = as_date(event.get("endDate")) or as_date(event.get("start"))
    if last and today > last:
        return "This event is over."
    return None


def clean_answers(config: dict, raw, enforce_required: bool = True) -> dict[str, str]:
    raw = raw if isinstance(raw, dict) else {}
    answers = {}
    for q in config["questions"]:
        value = raw.get(q["id"])
        value = value.strip()[:ANSWER_MAX] if isinstance(value, str) else ""
        if q["type"] == "choice" and value and value not in q["choices"]:
            raise SignupError(f'Pick one of the choices for "{q["label"]}".')
        if not value and q["required"] and enforce_required:
            raise SignupError(f'Answer "{q["label"]}".')
        if value:
            answers[q["id"]] = value
    return answers


def clean_note(raw) -> str:
    note = raw.strip() if isinstance(raw, str) else ""
    if len(note) > NOTE_MAX:
        raise SignupError(f"Keep the health or emergency note under {NOTE_MAX} characters.")
    return note


def parse_clock(value) -> time | None:
    if isinstance(value, str) and re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
        return time(int(value[:2]), int(value[3:]))
    return None
