"""Research cards on an event plan (eventPlans/{p}/options/{o}): checking what a planner or a Scout sends. Pure
functions, no Firestore.

Only plan_action writes cards, so every card is checked and stamped the same way whoever adds it. Availability is a
status a person sets; when it changes it is stamped with who set it and when (the caller adds the time).
"""

from __future__ import annotations

from handlers.drive_time import is_google
from handlers.membership import InvalidInput
from handlers.plans_brief import amenities
from handlers.plans_core import day, text, whole

AVAILABILITY = ("unknown", "contacted", "available", "held", "booked", "unavailable")
MAX_OPTIONS = 60
MAX_LINKS = 5


def _link(raw) -> str:
    link = raw.strip() if isinstance(raw, str) else ""
    if not link.startswith(("https://", "http://")) or len(link) > 500 or any(c.isspace() for c in link):
        raise InvalidInput("Links must be web addresses starting with http:// or https://.")
    return link


def _maybe_int(raw, high: int, what: str) -> int | None:
    return None if raw in (None, "") else whole(raw, 0, high, what)


def option(raw: dict | None) -> dict:
    """A card's fields from a request, without who made it, when, its likes or whether it is pinned."""
    raw = raw if isinstance(raw, dict) else {}
    links = raw.get("links") or []
    if not isinstance(links, list) or len(links) > MAX_LINKS:
        raise InvalidInput(f"Add up to {MAX_LINKS} links.")
    maps_url = text(raw.get("mapsUrl"), 500, "Google Maps link")
    if maps_url and not is_google(maps_url):
        raise InvalidInput("The Google Maps link must be a Google Maps address, such as one from Share.")
    booking = raw.get("bookingOpens") if isinstance(raw.get("bookingOpens"), dict) else {}
    opens = {"date": day(booking.get("date"), "booking date"), "note": text(booking.get("note"), 200, "booking note")}
    drive = _maybe_int(raw.get("driveMinutes"), 1440, "drive time in minutes")
    return {
        "name": text(raw.get("name"), 120, "option's name", required=True),
        "type": text(raw.get("type"), 40, "kind of place"),
        "links": [_link(x) for x in links],
        "mapsUrl": maps_url,
        "costCents": _maybe_int(raw.get("costCents"), 10_000_000, "cost in cents"),
        "driveMinutes": drive,
        "driveEstimated": raw.get("driveEstimated") is True and drive is not None,
        "capacity": _maybe_int(raw.get("capacity"), 10_000, "capacity"),
        "amenities": amenities(raw.get("amenities")),
        "bookingOpens": opens if opens["date"] or opens["note"] else None,
        "pros": text(raw.get("pros"), 1000, "pros"),
        "cons": text(raw.get("cons"), 1000, "cons"),
        "notes": text(raw.get("notes"), 1000, "notes"),
    }


def availability(raw: dict | None) -> tuple[str, str]:
    """(state, note) from a request."""
    raw = raw if isinstance(raw, dict) else {}
    state = raw.get("state") if raw.get("state") in AVAILABILITY else "unknown"
    return state, text(raw.get("note"), 200, "availability note")


def availability_changed(old: dict | None, state: str, note: str) -> bool:
    old = old or {}
    return old.get("state") != state or (old.get("note") or "") != note


def may_edit(card: dict, member_id: str | None, adult_editor: bool) -> bool:
    """Adults who edit the plan may change any card; a Scout only the cards they added."""
    return adult_editor or (bool(member_id) and card.get("createdByMemberId") == member_id)
