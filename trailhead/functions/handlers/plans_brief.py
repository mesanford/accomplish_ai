"""A plan's trip brief: what the troop is looking for, asked before research starts. Pure functions, no Firestore.

The brief guides research: a research card that is too far, over budget, too small or missing a must-have is
flagged against it. Dates and headcount stay where they already live on the plan (targetWindow and headcount).
"""

from __future__ import annotations

from handlers.plans_core import text, whole

LODGING = ("tents", "cabins", "either")
TRIP_LENGTHS = ("day", "weekend", "short", "week")  # a day, 1-2 nights, 3-5 nights, a week or more
SEASONS = ("spring", "summer", "fall", "winter", "any")
INTERESTS = (
    "hiking",
    "paddling",
    "fishing",
    "climbing",
    "swimming",
    "biking",
    "history",
    "nature",
    "service",
    "skills",
)
AMENITIES = ("water", "toilets", "showers", "fires", "swimming", "boating", "hiking", "shelter", "accessible", "store")
MAX_BUDGET_CENTS = 1_000_000


def amenities(raw) -> list[str]:
    """Known amenity keys only, each once, in the fixed order."""
    chosen = {x for x in raw if isinstance(x, str)} if isinstance(raw, list) else set()
    return [a for a in AMENITIES if a in chosen]


def _strings(raw) -> list[str]:
    """The strings in a list, ignoring anything else a client sent."""
    return [x for x in raw if isinstance(x, str)] if isinstance(raw, list) else []


def brief(raw: dict | None) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    interests = set(_strings(raw.get("interests")))
    return {
        "maxDriveMinutes": whole(raw.get("maxDriveMinutes"), 0, 1440, "longest drive in minutes") or None,
        "budgetCents": whole(raw.get("budgetCents"), 0, MAX_BUDGET_CENTS, "budget in cents") or None,
        "lodging": raw.get("lodging") if raw.get("lodging") in LODGING else "either",
        "mustHaves": amenities(raw.get("mustHaves")),
        "notes": text(raw.get("notes"), 500, "notes"),
        "tripLength": raw.get("tripLength") if raw.get("tripLength") in TRIP_LENGTHS else None,
        "season": raw.get("season") if raw.get("season") in SEASONS else None,
        "interests": [i for i in INTERESTS if i in interests],
    }
