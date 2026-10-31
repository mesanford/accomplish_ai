"""Event plan templates and milestones. Pure functions, no network or Firestore.

A template gives a new plan its kind, activity log settings and a backward timeline of milestones. A milestone is
anchored to the trip's first day (so many days before or after it) or fixed to a date. The server works out each
milestone's `dueOn` whenever the milestone or the trip's first day changes, so clients never compute it. The
timelines are common practice, not an official standard, and every one can be edited.
"""

from __future__ import annotations

from datetime import timedelta

from handlers.membership import InvalidInput
from handlers.plans_core import day, text, whole
from handlers.signup_config import as_date

START, FIXED = "start", "fixed"
MAX_MILESTONES = 40
OWNERS = ("leader", "committee", "treasurer", "quartermaster", "tripLead", "patrols")

CAMPOUT = [
    ("Choose a site", -60, "leader"),
    ("Reserve the site", -45, "leader"),
    ("Open sign-ups", -30, "leader"),
    ("Check health forms (Parts A and B)", -14, "leader"),
    ("Menus and duty rosters from each patrol", -10, "patrols"),
    ("Gear list to the quartermaster", -7, "quartermaster"),
    ("Confirm drivers and seats", -5, "tripLead"),
    ("Final headcount to the site", -3, "tripLead"),
    ("Debrief at the next PLC", 7, "leader"),
]
SERVICE = [
    ("Contact the group you will help", -45, "tripLead"),
    ("Confirm the date and the work", -30, "tripLead"),
    ("Open sign-ups", -21, "leader"),
    ("Tools and supplies list", -10, "quartermaster"),
    ("Confirm adults and drivers", -5, "tripLead"),
    ("Record service hours", 3, "leader"),
    ("Send a thank-you note", 14, "patrols"),
]
# A long trip's usual sequence, counted back from the trek. Booking windows and payment dates differ by program and
# year: the destination's own site decides, so these are reminders to check, not dates to rely on.
HIGH_ADVENTURE = [
    ("Survey interest and pick a destination", -760, "patrols"),
    ("Book during the program's registration window (check its site)", -700, "leader"),
    ("Pay the deposit", -640, "treasurer"),
    ("Plan fundraising (ask the council if it needs approval)", -600, "committee"),
    ("Name the crew and its adults", -365, "leader"),
    ("Schedule physicals for health form Part C", -180, "leader"),
    ("Line up first aid training the program asks for", -150, "leader"),
    ("Start conditioning hikes", -120, "patrols"),
    ("Final payment (check the program's date)", -90, "treasurer"),
    ("Shakedown: gear check and practice trip", -30, "patrols"),
    ("Debrief and share photos with families", 14, "patrols"),
]
TEMPLATES = {
    "campout": {"logKind": "campout", "milestones": CAMPOUT},
    "service": {"logKind": "service", "milestones": SERVICE},
    "highAdventure": {"logKind": "campout", "milestones": HIGH_ADVENTURE},
    "other": {"logKind": "other", "milestones": []},
}


def template_milestones(kind: str) -> list[dict]:
    rows = TEMPLATES.get(kind, TEMPLATES["other"])["milestones"]
    return [
        {"title": title, "anchor": START, "offsetDays": offset, "ownerRole": owner, "order": i}
        for i, (title, offset, owner) in enumerate(rows)
    ]


def milestone(raw: dict | None) -> dict:
    """A milestone from a planner: a title, and either days from the first day or a fixed date."""
    raw = raw if isinstance(raw, dict) else {}
    anchor = raw.get("anchor") if raw.get("anchor") in (START, FIXED) else START
    out = {
        "title": text(raw.get("title"), 120, "milestone", required=True),
        "anchor": anchor,
        "offsetDays": 0,
        "fixedOn": None,
        "ownerRole": raw.get("ownerRole") if raw.get("ownerRole") in OWNERS else None,
        "order": whole(raw.get("order"), 0, 1000, "order"),
    }
    if anchor == FIXED:
        out["fixedOn"] = day(raw.get("fixedOn"), "milestone date")
        if out["fixedOn"] is None:
            raise InvalidInput("Enter the milestone's date.")
    else:
        offset = raw.get("offsetDays", 0)
        if isinstance(offset, bool) or not isinstance(offset, int) or not -1000 <= offset <= 365:
            raise InvalidInput("Enter how many days before or after the trip, from -1000 to 365.")
        out["offsetDays"] = offset
    return out


def due_on(m: dict, start: str | None) -> str | None:
    """The milestone's date, or None while the trip has no first day."""
    if m.get("anchor") == FIXED:
        return m.get("fixedOn")
    first = as_date(start)
    if first is None:
        return None
    return (first + timedelta(days=int(m.get("offsetDays") or 0))).isoformat()


def overdue(m: dict, today_iso: str) -> bool:
    return not m.get("done") and bool(m.get("dueOn")) and m["dueOn"] < today_iso
