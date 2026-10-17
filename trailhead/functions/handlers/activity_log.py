"""Activity credits (camping nights, service hours, hiking miles). No Firestore calls here.

Credits live in `troops/{t}/logs`, one document per credit, and only the server writes them:

- An event credit has the id `{eventId}_{scoutId}`. It is worked out from the event's log fields and whether the Scout
  was marked present, so running it again gives the same document (idempotent), and it is deleted when the Scout is no
  longer present or the event no longer has anything to credit.
- A manual entry has a generated id. A leader's entry is approved at once. A parent's, or a Scout's own (13 or older,
  because younger Scouts have no login), waits as `pending` until a leader approves it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from math import isfinite

from handlers.membership import InvalidInput
from handlers.roles import acts_for

KINDS = ("campout", "service", "hike", "other")
MAX_NIGHTS, MAX_HOURS, MAX_MILES = 60, 1000.0, 2000.0
MAX_NOTE = 200
MAX_PENDING = 10  # entries a family may leave waiting for a leader, per Scout
NOTHING = "Add at least one night, service hour or mile."


def _amount(value, cap: float, whole: bool = False) -> int | float:
    """A non-negative number, kept within `cap`. Anything else counts as zero."""
    if isinstance(value, bool) or not isinstance(value, int | float) or not isfinite(value) or value <= 0:
        return 0
    value = min(value, cap)
    return int(value) if whole else round(float(value), 2)


def event_credit(event: dict | None) -> dict | None:
    """What each Scout who was present earns from this event, or None if the event credits nothing."""
    event = event or {}
    values = event.get("logValues") or {}
    nights = _amount(values.get("nights"), MAX_NIGHTS, whole=True)
    hours = _amount(values.get("serviceHours"), MAX_HOURS)
    miles = _amount(values.get("miles"), MAX_MILES)
    if not (nights or hours or miles):
        return None
    kind = event.get("logKind")
    if kind not in KINDS:
        kind = "campout" if nights else "service" if hours else "hike"
    return {"kind": kind, "nights": nights, "serviceHours": hours, "miles": miles}


def event_log_doc(event_id: str, event: dict | None, scout_id: str) -> dict | None:
    credit = event_credit(event)
    if credit is None:
        return None
    return {
        "scoutId": scout_id,
        "eventId": event_id,
        "eventTitle": str((event or {}).get("title") or "")[:120],
        "date": (event or {}).get("start"),
        "source": "event",
        "status": "approved",
        **credit,
    }


def event_log_id(event_id: str, scout_id: str) -> str:
    return f"{event_id}_{scout_id}"


def scout_log_change(event_id: str, event: dict | None, scout_id: str, present: bool, existing: dict | None):
    """("set", doc) or ("delete", None) to bring one Scout's event credit up to date, or None if it already is."""
    wanted = event_log_doc(event_id, event, scout_id) if present else None
    if wanted is None:
        return ("delete", None) if existing is not None else None
    return None if existing == wanted else ("set", wanted)


@dataclass
class LogPlan:
    sets: dict[str, dict] = field(default_factory=dict)  # log id -> document
    deletes: list[str] = field(default_factory=list)  # log ids


def plan_event_logs(event_id: str, event: dict | None, present_ids: set[str], existing: dict[str, dict]) -> LogPlan:
    """Recompute every Scout's credit for one event. `event` is None when the event was deleted. `present_ids`: the
    Scouts marked present. `existing`: this event's credits, by log id."""
    plan = LogPlan()
    scouts = set(present_ids) | {d["scoutId"] for d in existing.values() if d.get("scoutId")}
    for scout_id in sorted(scouts):
        log_id = event_log_id(event_id, scout_id)
        present = scout_id in present_ids and event is not None
        change = scout_log_change(event_id, event, scout_id, present, existing.get(log_id))
        if change is None:
            continue
        if change[0] == "set":
            plan.sets[log_id] = change[1]
        else:
            plan.deletes.append(log_id)
    return plan


def credit_inputs_changed(before: dict | None, after: dict | None) -> bool:
    """True if an event write could change anyone's credit: its log fields, date or title."""
    keys = ("logValues", "logKind", "start", "title")
    return any((before or {}).get(k) != (after or {}).get(k) for k in keys)


def _day(value, today: date) -> str:
    try:
        day = date.fromisoformat(str(value)[:10])
    except ValueError as err:
        raise InvalidInput("Enter the date as YYYY-MM-DD.") from err
    if day > today:
        raise InvalidInput("The date can't be in the future.")
    if day.year < today.year - 10:
        raise InvalidInput("That date is too long ago. Check the year.")
    return day.isoformat()


def parse_manual_entry(data: dict, today: date) -> dict:
    """Validate a manual entry: kind, date, note and the amounts. Raises InvalidInput with a message to show."""
    kind = data.get("kind")
    if kind not in KINDS:
        raise InvalidInput("Pick campout, service, hike or other.")
    note = " ".join(str(data.get("note") or "").split())
    if not note:
        raise InvalidInput("Add a short note about what this was.")
    if len(note) > MAX_NOTE:
        raise InvalidInput(f"The note must be {MAX_NOTE} characters or fewer.")
    amounts = {
        "nights": _amount(data.get("nights"), MAX_NIGHTS, whole=True),
        "serviceHours": _amount(data.get("serviceHours"), MAX_HOURS),
        "miles": _amount(data.get("miles"), MAX_MILES),
    }
    if not any(amounts.values()):
        raise InvalidInput(NOTHING)
    entry = {"kind": kind, "date": _day(data.get("date"), today), "note": note, **amounts}
    if data.get("eagleProject") is True and amounts["serviceHours"]:
        entry["eagleProject"] = True
    return entry


def may_add_for(access: dict, scout_id: str, leader: bool) -> bool:
    """A leader may add for any Scout. A parent, or the Scout's own login, only for a Scout they act for."""
    return leader or acts_for(access, scout_id)


def manual_entry_doc(entry: dict, scout_id: str, member_id: str, member_name: str, leader: bool) -> dict:
    return {
        **entry,
        "scoutId": scout_id,
        "source": "manual",
        "status": "approved" if leader else "pending",
        "enteredByMemberId": member_id,
        "enteredByName": member_name[:80],
    }


def review_blocker(entry: dict | None, action: str) -> str | None:
    """Why this review can't happen, or None. Only a manual entry that is waiting can be approved or rejected."""
    if entry is None or entry.get("source") != "manual":
        return "That entry was not found."
    if action not in ("approve", "reject"):
        return "Choose approve or reject."
    if entry.get("status") != "pending":
        return "A leader has already answered this entry."
    return None


def delete_blocker(entry: dict | None, leader: bool) -> str | None:
    """Why this entry can't be deleted, or None. Event credits follow attendance, so they are never deleted by hand.
    A family may remove only an entry still waiting for a leader."""
    if entry is None or entry.get("source") != "manual":
        return "That entry was not found."
    if not leader and entry.get("status") != "pending":
        return "Only a leader can delete an entry once a leader has answered it."
    return None
