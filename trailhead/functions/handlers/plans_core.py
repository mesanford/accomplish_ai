"""Event plans: checking what a planner sends. Pure functions, no network or Firestore.

A plan (troops/{t}/eventPlans/{p}) holds a trip before it becomes events: its dates and place, the planned adults
and drivers, notes for families and the decision. Only the plan_action function writes it, after these checks.
Phase 1 plans have one segment, which becomes one event when a leader publishes.
"""

from __future__ import annotations

import re

from handlers.membership import InvalidInput
from handlers.signup_config import as_date

KINDS = ("campout", "service", "highAdventure", "other")
LOG_KINDS = ("campout", "service", "hike", "other")
TRANSPORT = ("families", "carpool", "none")
MAX_TITLE, MAX_PLACE, MAX_NOTES = 120, 120, 2000
MAX_FEE_CENTS = 1_000_000  # the events rule's limit, $10,000
MAX_ADULTS, MAX_DRIVERS, MAX_HELPERS = 20, 20, 20


def text(raw, limit: int, what: str, required: bool = False) -> str:
    value = raw.strip() if isinstance(raw, str) else ""
    if required and not value:
        raise InvalidInput(f"Enter the {what}.")
    if len(value) > limit:
        raise InvalidInput(f"The {what} can be up to {limit} characters.")
    return value


def whole(raw, low: int, high: int, what: str) -> int:
    if raw in (None, ""):
        return 0
    if isinstance(raw, bool) or not isinstance(raw, int | float) or raw != int(raw) or not low <= raw <= high:
        raise InvalidInput(f"Enter the {what} as a whole number from {low} to {high}.")
    return int(raw)


def day(raw, what: str) -> str | None:
    if raw in (None, ""):
        return None
    d = as_date(raw)
    if d is None:
        raise InvalidInput(f"Enter the {what} as a date.")
    return d.isoformat()


def _clock(raw, what: str) -> str | None:
    if raw in (None, ""):
        return None
    if not isinstance(raw, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", raw):
        raise InvalidInput(f"Enter the {what} as a time, such as 19:00.")
    return raw


def _number(raw, high: float, what: str) -> float:
    if raw in (None, ""):
        return 0
    if isinstance(raw, bool) or not isinstance(raw, int | float) or not 0 <= raw <= high:
        raise InvalidInput(f"Enter the {what} as a number from 0 to {high:g}.")
    return raw


def segment(raw: dict | None) -> dict:
    """The one segment: dates, times, place, activity log and sign-up settings for the event it becomes."""
    raw = raw if isinstance(raw, dict) else {}
    out = {
        "id": "s1",
        "start": day(raw.get("start"), "first day"),
        "endDate": day(raw.get("endDate"), "last day"),
        "startTime": _clock(raw.get("startTime"), "start time"),
        "endTime": _clock(raw.get("endTime"), "end time"),
        "place": text(raw.get("place"), MAX_PLACE, "place"),
        "logKind": raw.get("logKind") if raw.get("logKind") in LOG_KINDS else "other",
        "partC": raw.get("partC") is True,
        "healthConfirmed": raw.get("healthConfirmed") is True,
        "feeCents": whole(raw.get("feeCents"), 0, MAX_FEE_CENTS, "fee in cents"),
    }
    log = raw.get("logValues") if isinstance(raw.get("logValues"), dict) else {}
    out["logValues"] = {
        "nights": _number(log.get("nights"), 60, "nights"),
        "miles": _number(log.get("miles"), 2000, "miles"),
        "serviceHours": _number(log.get("serviceHours"), 1000, "service hours"),
    }
    sign = raw.get("signups") if isinstance(raw.get("signups"), dict) else {}
    out["signups"] = {
        "enabled": sign.get("enabled") is True,
        "capacity": whole(sign.get("capacity"), 0, 500, "number of spots") or None,
        "needsPermission": sign.get("needsPermission") is True,
        "deadline": day(sign.get("deadline"), "sign-up deadline"),
    }
    if out["start"] and out["endDate"] and out["endDate"] < out["start"]:
        raise InvalidInput("The last day can not be before the first.")
    if out["start"] and out["endDate"] == out["start"]:
        out["endDate"] = None
    if not out["endDate"] and out["startTime"] and out["endTime"] and out["endTime"] <= out["startTime"]:
        raise InvalidInput("The end time needs to be after the start time.")
    return out


def core(raw: dict | None) -> dict:
    """Title, kind, rough headcount, notes for families and the segment."""
    raw = raw if isinstance(raw, dict) else {}
    window = raw.get("targetWindow") if isinstance(raw.get("targetWindow"), dict) else {}
    heads = raw.get("headcount") if isinstance(raw.get("headcount"), dict) else {}
    out = {
        "title": text(raw.get("title"), MAX_TITLE, "plan's name", required=True),
        "kind": raw.get("kind") if raw.get("kind") in KINDS else "other",
        "targetWindow": {"from": day(window.get("from"), "earliest date"), "to": day(window.get("to"), "latest date")},
        "headcount": {
            "scouts": whole(heads.get("scouts"), 0, 500, "number of Scouts"),
            "adults": whole(heads.get("adults"), 0, 200, "number of adults"),
        },
        "familyNotes": text(raw.get("familyNotes"), MAX_NOTES, "notes for families"),
        "packingList": text(raw.get("packingList"), MAX_NOTES, "packing list"),
        "segments": [segment((raw.get("segments") or [None])[0] if isinstance(raw.get("segments"), list) else None)],
    }
    if out["kind"] == "highAdventure":
        out["segments"][0]["partC"] = True  # high adventure needs health form Part C (see plan_rules.json, health_c)
    return out


def _ids(raw, limit: int, what: str) -> list[str]:
    if raw in (None, ""):
        return []
    if not isinstance(raw, list) or len(raw) > limit or not all(isinstance(x, str) and 0 < len(x) <= 128 for x in raw):
        raise InvalidInput(f"Choose up to {limit} {what}.")
    return list(dict.fromkeys(raw))


def staffing(raw: dict | None) -> dict:
    """Planned adults, how everyone travels, drivers and their seats, and the drivers' attestations."""
    raw = raw if isinstance(raw, dict) else {}
    drivers = raw.get("drivers") or []
    if not isinstance(drivers, list) or len(drivers) > MAX_DRIVERS:
        raise InvalidInput(f"Add up to {MAX_DRIVERS} drivers.")
    clean_drivers = []
    for d in drivers:
        if not isinstance(d, dict) or not isinstance(d.get("memberId"), str) or not d["memberId"]:
            raise InvalidInput("Choose each driver from the troop's adults.")
        clean_drivers.append({"memberId": d["memberId"], "seats": whole(d.get("seats"), 0, 15, "seats")})
    attest = raw.get("attest") if isinstance(raw.get("attest"), dict) else {}
    return {
        "adultMemberIds": _ids(raw.get("adultMemberIds"), MAX_ADULTS, "adults"),
        "adultsFromSignups": raw.get("adultsFromSignups") is True,
        "transport": raw.get("transport") if raw.get("transport") in TRANSPORT else None,
        "drivers": clean_drivers,
        "driveMinutes": whole(raw.get("driveMinutes"), 0, 1440, "minutes of driving"),
        "attest": {"licensed": attest.get("licensed") is True, "seatBelts": attest.get("seatBelts") is True},
    }


def member_ids_in(staff: dict) -> set[str]:
    return set(staff["adultMemberIds"]) | {d["memberId"] for d in staff["drivers"]}


def decision(raw: dict | None, option_ids: set[str]) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    option_id = raw.get("optionId") or None
    if option_id is not None and option_id not in option_ids:
        raise InvalidInput("Choose one of the plan's options.")
    return {
        "optionId": option_id,
        "rationale": text(raw.get("rationale"), 1000, "reason"),
        "tally": text(raw.get("tally"), 60, "vote count"),
        "reviewOn": day(raw.get("reviewOn"), "review date"),
    }


def private(raw: dict | None) -> dict:
    """The adult-only panel: contacts, confirmation numbers, notes and helpers who are not troop members."""
    raw = raw if isinstance(raw, dict) else {}
    helpers = raw.get("helpers") or []
    if not isinstance(helpers, list) or len(helpers) > MAX_HELPERS:
        raise InvalidInput(f"Add up to {MAX_HELPERS} helpers.")
    return {
        "contacts": text(raw.get("contacts"), MAX_NOTES, "contacts"),
        "confirmations": text(raw.get("confirmations"), 500, "confirmation numbers"),
        "notes": text(raw.get("notes"), MAX_NOTES, "adult notes"),
        "helpers": [text(h, 80, "helper's name", required=True) for h in helpers],
    }
