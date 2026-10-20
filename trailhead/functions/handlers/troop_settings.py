"""Troop settings: the troop's details, meeting place, time zone and key positions. Pure, no Firestore.

Leaders save these with `save_troop_settings`. The roles people hold (Scoutmaster, treasurer and so on) are set per
person with `set_member_roles`; `positions` holds the two key positions that are not app roles.
"""

from __future__ import annotations

import re

from handlers.membership import InvalidInput
from handlers.time_zones import known_zone

TEXT_LIMITS = {"council": 80, "district": 80, "charterOrg": 120}
ADDRESS_LIMITS = {"place": 120, "street": 120, "city": 80}
POSITIONS = ("committeeChair", "charterRep")
STATES = set(
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR "
    "PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU MP AS AA AE AP".split()
)


def _text(value, limit: int, label: str, required: bool = False) -> str:
    text = value.strip() if isinstance(value, str) else ""
    if required and not text:
        raise InvalidInput(f"{label} is required.")
    if len(text) > limit:
        raise InvalidInput(f"{label} must be {limit} characters or fewer.")
    return text


def _address(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    out = {key: _text(raw.get(key), limit, key.title()) for key, limit in ADDRESS_LIMITS.items()}
    state = _text(raw.get("state"), 2, "State").upper()
    if state and state not in STATES:
        raise InvalidInput("Enter the state as its two-letter code, such as IL.")
    zip_code = _text(raw.get("zip"), 10, "ZIP code")
    if zip_code and not re.fullmatch(r"\d{5}(-\d{4})?", zip_code):
        raise InvalidInput("Enter the ZIP code as 5 digits, or 5 and 4 such as 60601-1234.")
    return {**out, "state": state, "zip": zip_code}


def _positions(raw, adults: set[str]) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    for key in POSITIONS:
        member_id = raw.get(key) or None
        if member_id is not None and member_id not in adults:
            raise InvalidInput("Pick an adult in the troop for each position, or leave it empty.")
        out[key] = member_id
    return out


def parse_settings(data: dict, adults: set[str]) -> dict:
    """The troop document fields to save. `adults` are the member ids of the troop's adults."""
    zone = known_zone(data.get("timezone"))
    if zone is None:
        raise InvalidInput("Pick the troop's time zone.")
    out = {
        "name": _text(data.get("name"), 80, "Troop name", required=True),
        "unitNumber": _text(data.get("unitNumber"), 10, "Unit number", required=True),
        **{
            key: _text(data.get(key), limit, label)
            for key, limit, label in (
                ("council", TEXT_LIMITS["council"], "Council"),
                ("district", TEXT_LIMITS["district"], "District"),
                ("charterOrg", TEXT_LIMITS["charterOrg"], "Chartered organization"),
            )
        },
        "meetingPlace": _address(data.get("meetingPlace")),
        "timezone": zone,
        "positions": _positions(data.get("positions"), adults),
    }
    return out


def renamed(before: dict, after: dict) -> bool:
    """True if the name or unit number changed, so the copies in members' records and the website need it too."""
    return before.get("name") != after["name"] or before.get("unitNumber") != after["unitNumber"]
