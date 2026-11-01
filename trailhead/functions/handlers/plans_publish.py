"""Turning a plan into an event, and comparing them afterwards. Pure functions, no network or Firestore.

Publishing writes an ordinary event, so sign-ups, permission, fees, health form checks, reminders, change alerts,
activity credit and calendar feeds all work as they do for any event. After that the event owns its details:
leaders keep editing it as usual. The plan keeps a snapshot of what it published, so it can show where the live
event now differs, and a re-publish writes only the fields a leader ticks.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from trailhead_core.plan_checks import health_level

# The event fields a plan writes. Plan-only details (staffing, notes, budget) never go on the event.
PUBLISHED = (
    "title",
    "start",
    "endDate",
    "startTime",
    "endTime",
    "place",
    "feeCents",
    "healthForm",
    "logKind",
    "logValues",
    "signups",
)
SIGNUP_KEYS = ("enabled", "capacity", "deadline", "needsPermission")
AVAILABILITY = ("unknown", "contacted", "available", "held", "booked", "unavailable")
SECURED = ("held", "booked")
STALE_DAYS = 30


def event_id_for(plan_id: str, segment_id: str) -> str:
    """The event a segment creates. Fixed, so a retried publish finds the event it already made."""
    return f"{plan_id}_{segment_id}"


def event_fields(plan: dict) -> dict:
    """The plan's values for the PUBLISHED fields. A missing value means "no value", like a blank on the form."""
    seg = (plan.get("segments") or [{}])[0]
    sign = seg.get("signups") or {}
    out = {
        "title": plan.get("title", ""),
        "start": seg.get("start"),
        "endDate": seg.get("endDate"),
        "startTime": seg.get("startTime"),
        "endTime": seg.get("endTime"),
        "place": seg.get("place") or None,
        "feeCents": seg.get("feeCents") or None,
        "healthForm": health_level(seg)[0],
        "logKind": seg.get("logKind") or "other",
        "logValues": dict(seg.get("logValues") or {"nights": 0, "miles": 0, "serviceHours": 0}),
        "signups": None,
    }
    if sign.get("enabled"):
        out["signups"] = {
            "enabled": True,
            "audience": "both",
            "capacity": sign.get("capacity") or None,
            "deadline": sign.get("deadline") or None,
            "needsPermission": sign.get("needsPermission") is True,
            "questions": [],
        }
    return out


def new_event(plan_id: str, plan: dict) -> dict:
    """The event document a first publish creates. Never on the public website until a leader says so."""
    fields = {k: v for k, v in event_fields(plan).items() if v is not None}
    seg_id = (plan.get("segments") or [{}])[0].get("id", "s1")
    return {**fields, "public": False, "linkedRequirements": [], "planId": plan_id, "planSegmentId": seg_id}


def norm(key: str, value):
    """A field's value as the plan compares it. The plan owns only some sign-up settings (questions, the audience
    and closing sign-ups stay on the event), and a missing activity count is zero."""
    if key == "signups":
        if not isinstance(value, dict) or value.get("enabled") is not True:
            return None
        return {k: value.get(k) or None for k in SIGNUP_KEYS if k != "needsPermission"} | {
            "needsPermission": value.get("needsPermission") is True
        }
    if key == "logValues":
        v = value if isinstance(value, dict) else {}
        return {k: v.get(k) or 0 for k in ("nights", "miles", "serviceHours")}
    return value if value not in ("", 0) else None


def snapshot(event: dict) -> dict:
    """What the plan remembers about the event, for later comparison."""
    return {k: norm(k, event.get(k)) for k in PUBLISHED}


def diff(plan: dict, live: dict, snap: dict | None) -> list[dict]:
    """Fields where the plan and the live event disagree. `editedOnEvent` marks a field a leader changed on the
    event itself since the last publish: re-publishing it would undo that edit."""
    planned, snap = event_fields(plan), snap or {}
    out = []
    for key in PUBLISHED:
        mine, theirs = norm(key, planned.get(key)), norm(key, live.get(key))
        if mine != theirs:
            out.append(
                {
                    "field": key,
                    "plan": mine,
                    "event": theirs,
                    "editedOnEvent": key in snap and theirs != snap.get(key),
                }
            )
    return out


def drift(live: dict, snap: dict | None) -> list[str]:
    """Fields a leader changed on the event since the plan last published it."""
    snap = snap or {}
    return [k for k in PUBLISHED if k in snap and norm(k, live.get(k)) != snap.get(k)]


def update_for(plan: dict, live: dict, fields: list[str]) -> dict:
    """The Firestore field values for a re-publish of the ticked `fields`. None means delete the field. Sign-up
    settings merge into the event's own, keeping its questions; turning them off keeps them for later."""
    planned = event_fields(plan)
    out = {}
    for key in fields:
        if key not in PUBLISHED or norm(key, planned.get(key)) == norm(key, live.get(key)):
            continue
        value = planned.get(key)
        if key == "signups":
            current = live.get("signups") if isinstance(live.get("signups"), dict) else {}
            mine = {k: v for k, v in (value or {}).items() if k in SIGNUP_KEYS}
            value = {**current, **mine} if value else ({**current, "enabled": False} if current else None)
        out[key] = value
    return out


def core_from_event(event: dict) -> dict:
    """A plan's core fields from an existing event, for "start a plan from this event" (checked by plans_core.core)."""
    sign = event.get("signups") if isinstance(event.get("signups"), dict) else {}
    kind = event.get("logKind") if event.get("logKind") in ("campout", "service") else "other"
    return {
        "title": event.get("title", ""),
        "kind": kind,
        "segments": [
            {
                **{k: event.get(k) for k in ("start", "endDate", "startTime", "endTime", "place", "feeCents")},
                "logKind": event.get("logKind"),
                "logValues": event.get("logValues"),
                "partC": event.get("healthForm") == "abc",
                "signups": {k: sign.get(k) for k in SIGNUP_KEYS},
            }
        ],
    }


def availability_problem(option: dict | None, now: datetime) -> str | None:
    """Why the chosen place is not known to be secured, or None when it is held or booked and checked lately."""
    if not option:
        return None
    a = option.get("availability") or {}
    if a.get("state") not in SECURED:
        return f"{option.get('name', 'The chosen place')} is not marked as held or booked."
    at = a.get("at")
    if not isinstance(at, datetime) or now - at > timedelta(days=STALE_DAYS):
        return f"{option.get('name', 'The chosen place')} was marked {a['state']} more than {STALE_DAYS} days ago."
    return None
