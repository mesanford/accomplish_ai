"""Troop settings: what a leader can save, and when the name is copied elsewhere."""

from datetime import date

import pytest

from handlers.membership import InvalidInput, new_troop
from handlers.time_zones import DEFAULT_ZONE, ZONES, known_zone
from handlers.troop_settings import parse_settings, renamed

ADULTS = {"m-lead", "m-chair"}
GOOD = {
    "name": " Troop 101 ",
    "unitNumber": "101",
    "council": "Prairielands",
    "district": "Sangamon",
    "charterOrg": "First Methodist Church",
    "meetingPlace": {
        "place": "Church hall",
        "street": "1 Main St",
        "city": "Springfield",
        "state": "il",
        "zip": "62701",
    },
    "timezone": "America/Los_Angeles",
    "positions": {"committeeChair": "m-chair", "charterRep": ""},
}


def test_a_full_set_of_settings():
    out = parse_settings(GOOD, ADULTS)
    assert out["name"] == "Troop 101" and out["timezone"] == "America/Los_Angeles"
    assert out["meetingPlace"] == {
        "place": "Church hall",
        "street": "1 Main St",
        "city": "Springfield",
        "state": "IL",
        "zip": "62701",
    }
    assert out["positions"] == {"committeeChair": "m-chair", "charterRep": None}


def test_only_name_unit_and_time_zone_are_needed():
    out = parse_settings({"name": "T", "unitNumber": "9", "timezone": "Pacific/Honolulu"}, set())
    assert out["council"] == "" and out["meetingPlace"]["state"] == ""


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"name": ""}, "Troop name is required"),
        ({"unitNumber": "12345678901"}, "10 characters"),
        ({"timezone": "Mars/Olympus"}, "time zone"),
        ({"meetingPlace": {"state": "XX"}}, "two-letter"),
        ({"meetingPlace": {"zip": "6270"}}, "ZIP code"),
        ({"positions": {"committeeChair": "s1"}}, "adult in the troop"),
    ],
)
def test_settings_that_are_refused(change, message):
    with pytest.raises(InvalidInput, match=message):
        parse_settings({**GOOD, **change}, ADULTS)


def test_a_rename_is_noticed():
    out = parse_settings(GOOD, ADULTS)
    assert renamed({"name": "Troop 100", "unitNumber": "101"}, out)
    assert not renamed({"name": "Troop 101", "unitNumber": "101"}, out)


def test_zones():
    assert known_zone("America/Chicago") == "America/Chicago" and known_zone("UTC") is None
    assert DEFAULT_ZONE in ZONES and list(ZONES)[:2] == ["America/New_York", "America/Chicago"]


def test_a_new_troop_keeps_the_picked_zone_and_falls_back_to_central():
    base = {"name": "T", "unitNumber": "1", "displayName": "Pat", "yptExpiresAt": "2030-01-01"}
    troop, _ = new_troop({**base, "timezone": "America/Denver"}, "u1", date(2026, 10, 20))
    assert troop["timezone"] == "America/Denver"
    troop, _ = new_troop({**base, "timezone": "Nowhere"}, "u1", date(2026, 10, 20))
    assert troop["timezone"] == DEFAULT_ZONE
