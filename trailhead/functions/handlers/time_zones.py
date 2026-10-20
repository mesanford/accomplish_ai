"""The time zones a troop can pick. Pure, no Firestore. Keep in step with app/src/lib/timeZones.ts.

A troop's zone decides what "today" is for it: sign-off dates, deadlines, reminders, the weekly digest and calendars.
US zones come first; the rest cover troops overseas (Transatlantic and Far East councils).
"""

from __future__ import annotations

DEFAULT_ZONE = "America/Chicago"
ZONES: dict[str, str] = {
    "America/New_York": "Eastern",
    "America/Chicago": "Central",
    "America/Denver": "Mountain",
    "America/Phoenix": "Arizona (no daylight saving)",
    "America/Los_Angeles": "Pacific",
    "America/Anchorage": "Alaska",
    "Pacific/Honolulu": "Hawaii",
    "America/Puerto_Rico": "Atlantic (Puerto Rico, U.S. Virgin Islands)",
    "Pacific/Guam": "Chamorro (Guam, Northern Mariana Islands)",
    "Europe/London": "United Kingdom",
    "Europe/Berlin": "Central Europe",
    "Asia/Seoul": "Korea",
    "Asia/Tokyo": "Japan",
}


def known_zone(value) -> str | None:
    """The zone if it's one a troop can pick, else None."""
    return value if isinstance(value, str) and value in ZONES else None
