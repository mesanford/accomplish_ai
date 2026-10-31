"""Readiness checks for an event plan before it is published. Pure functions, no network or Firestore.

Each check reads what the plan says it will do (planned adults, trip length, transport) and returns pass, fail or
unknown. Unknown means the plan is missing something, and is never shown as a pass. A leader can acknowledge a
check that does not pass, with a note; the check then reads "acknowledged". Publishing needs every required check
to pass or be acknowledged. The checks advise and record: they never say a trip is approved or compliant.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, time
from pathlib import Path

RULES_FILE = Path(__file__).parent / "content" / "plan_rules.json"
PASS, FAIL, UNKNOWN, ACKNOWLEDGED = "pass", "fail", "unknown", "acknowledged"
PART_C_HOURS = 72
MAX_DRIVE_MINUTES = 600  # 10 hours of driving in any 24 hours
TRANSPORT_MODES = ("families", "carpool", "none")


def load_rules() -> dict:
    """The bundled rule records: {"version", "advisory", "rules": {id: rule}}."""
    doc = json.loads(RULES_FILE.read_text())
    return {**doc, "rules": {r["id"]: r for r in doc["rules"]}}


def _day(raw) -> date | None:
    if not isinstance(raw, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _clock(raw) -> time | None:
    if not isinstance(raw, str) or not re.fullmatch(r"\d\d:\d\d", raw):
        return None
    try:
        return time.fromisoformat(raw)
    except ValueError:
        return None


def trip_hours(segment: dict) -> float | None:
    """How long the trip lasts, or None without a start date. Without both clock times, whole days count as 24
    hours each, so a Friday to Sunday campout is 48 hours and a one-day event is 0."""
    start = _day(segment.get("start"))
    if start is None:
        return None
    end = _day(segment.get("endDate")) or start
    st, en = _clock(segment.get("startTime")), _clock(segment.get("endTime"))
    if st and en:
        return (datetime.combine(end, en) - datetime.combine(start, st)).total_seconds() / 3600
    return (end - start).days * 24.0


def health_level(segment: dict) -> tuple[str, bool]:
    """("ab" or "abc", whether a person must confirm it). Part C is needed past 72 hours, or when the planner
    marks the trip as a resident camp or one whose destination asks for it. Exactly 72 hours defaults to Part C
    and asks someone to confirm."""
    if segment.get("partC") is True:
        return "abc", False
    hours = trip_hours(segment)
    if hours is None or hours < PART_C_HOURS:
        return "ab", False
    if hours == PART_C_HOURS:
        return "abc", segment.get("healthConfirmed") is not True
    return "abc", False


def _health(plan: dict) -> tuple[str, str]:
    segment = (plan.get("segments") or [{}])[0]
    if _day(segment.get("start")) is None:
        return UNKNOWN, "Add the trip's dates to work out which health form parts are needed."
    level, confirm = health_level(segment)
    if confirm:
        return UNKNOWN, "The trip is exactly 72 hours. Confirm whether Part C is needed."
    if level == "abc":
        return PASS, "Parts A, B and C are needed for everyone going."
    return PASS, "Parts A and B are needed for everyone going."


def _two_deep(plan: dict) -> tuple[str, str]:
    staffing = plan.get("staffing") or {}
    adults = len(set(staffing.get("adultMemberIds") or []))
    if staffing.get("adultsFromSignups") is True and adults < 2:
        return UNKNOWN, "Adults will come from sign-ups. Check the roster before the trip."
    if adults >= 2:
        return PASS, f"{adults} adults are planned."
    return FAIL, "Fewer than two adults are planned." if adults else "No adults are planned yet."


def _transport(plan: dict) -> tuple[str, str]:
    staffing = plan.get("staffing") or {}
    mode = staffing.get("transport")
    if mode not in TRANSPORT_MODES:
        return UNKNOWN, "Say how everyone will get there."
    if mode == "none":
        return PASS, "No driving: everyone meets at the place."
    if mode == "families":
        return PASS, "Families bring their own Scouts."
    drivers = staffing.get("drivers") or []
    headcount = plan.get("headcount") or {}
    riders = int(headcount.get("scouts") or 0) + int(headcount.get("adults") or 0) - len(drivers)
    seats = sum(int(d.get("seats") or 0) for d in drivers if isinstance(d, dict))
    if not drivers:
        return FAIL, "No drivers are planned."
    if seats < riders:
        return FAIL, f"{seats} seats are planned for about {riders} riders."
    if int(staffing.get("driveMinutes") or 0) > MAX_DRIVE_MINUTES:
        return FAIL, "The longest day has more than 10 hours of driving."
    attest = staffing.get("attest") or {}
    if attest.get("licensed") is not True or attest.get("seatBelts") is not True:
        return UNKNOWN, "Confirm the drivers are 18 or older and licensed, and that everyone has a seat belt."
    return PASS, f"{len(drivers)} drivers with {seats} seats."


CHECKS = (("health_c", _health), ("two_deep", _two_deep), ("transport", _transport))


def check_intent(plan: dict, acks: dict, rules: dict) -> list[dict]:
    """One result per check, in display order. `acks` maps a rule id to {byMemberId, note}; `rules` is load_rules()."""
    out = []
    for rule_id, fn in CHECKS:
        status, message = fn(plan)
        rule = rules["rules"].get(rule_id, {})
        result = {
            "id": rule_id,
            "title": rule.get("title", rule_id),
            "status": status,
            "message": message,
            "required": True,
            "text": rule.get("text", ""),
            "sourceUrl": rule.get("sourceUrl", ""),
            "confidence": rule.get("confidence", "low"),
            "verifiedOn": rule.get("verifiedOn"),
        }
        ack = acks.get(rule_id)
        if status != PASS and ack:
            result["status"] = ACKNOWLEDGED
            result["ack"] = {"byMemberId": ack.get("byMemberId"), "note": ack.get("note", "")}
        out.append(result)
    return out


def blockers(results: list[dict]) -> list[str]:
    """Titles of the required checks that neither pass nor were acknowledged."""
    return [r["title"] for r in results if r["required"] and r["status"] not in (PASS, ACKNOWLEDGED)]
