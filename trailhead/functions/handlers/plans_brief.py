"""A plan's trip brief: what the troop is looking for, asked before research starts. Pure functions, no Firestore.

The brief guides research: a research card that is too far, over budget, too small or missing a must-have is
flagged against it. Dates and headcount stay where they already live on the plan (targetWindow and headcount).
"""

from __future__ import annotations

from handlers.plans_core import text, whole

LODGING = ("tents", "cabins", "either")
AMENITIES = ("water", "toilets", "showers", "fires", "swimming", "boating", "hiking", "shelter", "accessible", "store")
MAX_BUDGET_CENTS = 1_000_000


def amenities(raw) -> list[str]:
    """Known amenity keys only, each once, in the fixed order."""
    chosen = set(raw) if isinstance(raw, list) else set()
    return [a for a in AMENITIES if a in chosen]


def brief(raw: dict | None) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    return {
        "maxDriveMinutes": whole(raw.get("maxDriveMinutes"), 0, 1440, "longest drive in minutes") or None,
        "budgetCents": whole(raw.get("budgetCents"), 0, MAX_BUDGET_CENTS, "budget in cents") or None,
        "lodging": raw.get("lodging") if raw.get("lodging") in LODGING else "either",
        "mustHaves": amenities(raw.get("mustHaves")),
        "notes": text(raw.get("notes"), 500, "notes"),
    }
