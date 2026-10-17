"""Troop equipment and library: quantity math, check-out rules and overdue dates. Pure: dicts in, dicts out.

Data (all under troops/{t}):
  inventory/{id}        an item: name, category, quantity, tag?, location, condition, purchaseDate?, costCents?, notes,
                        photoPath?. `out` (how many are checked out) and `photoPath` are written only by the server.
                        Quantity 12 is a set of mess kits; quantity 1 with a tag is one tracked tent.
  checkouts/{id}        one loan: itemId, itemName, quantity, to a member or an event, dueDate, status out|returned.
  equipmentRequests/{id} a member's request for an item for an event: pending, approved or declined.
  maintenance/{id}      repair notes for an item.
"""

from __future__ import annotations

from datetime import date, timedelta

from handlers.membership import InvalidInput
from handlers.retention import is_due, local_date

CATEGORIES = {
    "tents": "Tents",
    "cooking": "Cooking",
    "tools": "Tools",
    "first_aid": "First aid",
    "library": "Library books and merit badge pamphlets",
    "other": "Other",
}
CONDITIONS = {"good": "Good", "needs_repair": "Needs repair", "retired": "Retired"}
MAX_QUANTITY = 1000
MAX_NOTE = 500
MAX_PENDING_REQUESTS = 10
FORMER_SCOUT = "Former Scout"
FORMER_MEMBER = "Former member"
HISTORY_YEARS = 7
# Roles that manage the inventory: the quartermaster, and the leaders (leader, Scoutmaster, advancement chair).
MANAGER_ROLES = {"quartermaster", "leader", "scoutmaster", "advancement"}


def can_manage(access: dict) -> bool:
    return bool(MANAGER_ROLES & set(access.get("roles", [])))


def available(item: dict) -> int:
    """How many of this item are on the shelf: the quantity less what is checked out. Never below zero."""
    return max(0, int(item.get("quantity", 0)) - int(item.get("out", 0)))


def parse_quantity(value, label: str = "Quantity") -> int:
    if type(value) is not int or not 1 <= value <= MAX_QUANTITY:
        raise InvalidInput(f"{label} must be a whole number from 1 to {MAX_QUANTITY}.")
    return value


def parse_day(value, label: str) -> str:
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except ValueError as err:
        raise InvalidInput(f"{label} must be a date, like 2026-11-14.") from err


def note_text(value) -> str:
    return str(value or "").strip()[:MAX_NOTE]


def check_out_blocker(item: dict | None, quantity: int) -> str | None:
    """Why this many of the item can't go out now, or None."""
    if item is None:
        return "That item isn't in the inventory."
    if item.get("condition") == "retired":
        return "That item is retired. Change its condition before checking it out."
    left = available(item)
    if quantity > left:
        if left == 0:
            return "None of that item is on the shelf."
        return f"Only {left} on the shelf. Check out {left} or fewer."
    return None


def parse_checkout(data: dict, today: date) -> dict:
    """The recipient and terms of a loan. Exactly one of memberId and eventId."""
    quantity = parse_quantity(data.get("quantity", 1))
    member_id, event_id = data.get("memberId"), data.get("eventId")
    if bool(member_id) == bool(event_id):
        raise InvalidInput("Choose a person or an event to check the item out to.")
    due = parse_day(data.get("dueDate"), "The due date")
    if date.fromisoformat(due) < today:
        raise InvalidInput("The due date can't be in the past.")
    return {
        "quantity": quantity,
        "toKind": "member" if member_id else "event",
        "toId": str(member_id or event_id),
        "dueDate": due,
        "note": note_text(data.get("note")),
    }


def parse_check_in(data: dict) -> tuple[str, str]:
    """(condition, note) when an item comes back."""
    condition = data.get("condition") or "good"
    if condition not in CONDITIONS:
        raise InvalidInput("Choose good, needs repair or retired.")
    return condition, note_text(data.get("note"))


def parse_request(data: dict) -> dict:
    return {
        "quantity": parse_quantity(data.get("quantity", 1)),
        "eventId": str(data.get("eventId") or ""),
        "note": note_text(data.get("note")),
    }


def is_overdue(checkout: dict, today: date) -> bool:
    """Still out and past its due date. Due today is not late."""
    if checkout.get("status") != "out" or not checkout.get("dueDate"):
        return False
    try:
        return date.fromisoformat(checkout["dueDate"]) < today
    except ValueError:
        return False


def days_overdue(checkout: dict, today: date) -> int:
    return (today - date.fromisoformat(checkout["dueDate"])).days if is_overdue(checkout, today) else 0


def default_due(event: dict, today: date) -> str:
    """When an approved event loan is due if the quartermaster gives no date: the day after the event ends."""
    last = event.get("endDate") or event.get("start") or today.isoformat()
    try:
        return max(date.fromisoformat(last) + timedelta(days=1), today).isoformat()
    except ValueError:
        return today.isoformat()


def history_due(closed_at, today: date) -> bool:
    """A closed loan, answered request or repair note is due for deletion 7 years after it was closed. An unknown
    date is never due."""
    return is_due(local_date(closed_at), HISTORY_YEARS * 12, today)
