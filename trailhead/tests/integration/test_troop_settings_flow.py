"""End-to-end: saving troop settings, and the new name reaching every copy of it."""

import os

import pytest

from tests.integration.test_functions import call, owner
from tests.rules.emulator import read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
T = "troops/ts"
FORM = {
    "troopId": "ts",
    "name": "Troop 12 Springfield",
    "unitNumber": "12",
    "council": "Prairielands",
    "district": "Sangamon",
    "charterOrg": "First Methodist Church",
    "meetingPlace": {
        "place": "Church hall",
        "street": "1 Main St",
        "city": "Springfield",
        "state": "IL",
        "zip": "62701",
    },
    "timezone": "America/Denver",
    "positions": {"committeeChair": "m-mom", "charterRep": None},
}


@pytest.fixture(autouse=True)
def seeded():
    reset()
    owner.set(T, {"name": "Troop 12", "unitNumber": "12", "site": {"slug": "troop-12", "published": True}})
    owner.set("publicSites/troop-12", {"troopName": "Troop 12", "unitNumber": "12", "troopId": "ts"})
    for uid, roles in {"lead": ["leader", "scoutmaster"], "mom": ["parent"]}.items():
        owner.set(f"{T}/members/m-{uid}", {"kind": "adult", "displayName": uid.title(), "uid": uid, "roles": roles})
        owner.set(f"{T}/access/{uid}", {"memberId": f"m-{uid}", "roles": roles, "scoutIds": []})
        entry = {"name": "Troop 12", "unitNumber": "12", "memberId": f"m-{uid}", "roles": roles}
        owner.set(f"users/{uid}", {"troops": {"ts": entry}, "emailDigest": True})
    owner.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Riley"})


def test_a_leader_saves_the_settings_and_the_new_name_reaches_every_copy():
    assert call("save_troop_settings", "mom", FORM).status_code == 403
    assert call("save_troop_settings", "lead", FORM).json()["result"] == {"saved": True}
    t = read(T)
    assert t["timezone"] == "America/Denver" and t["district"] == "Sangamon"
    assert t["meetingPlace"]["zip"] == "62701" and t["positions"] == {"committeeChair": "m-mom", "charterRep": None}
    assert t["site"] == {"slug": "troop-12", "published": True}  # untouched
    for uid in ("lead", "mom"):
        user = read(f"users/{uid}")
        assert user["troops"]["ts"]["name"] == "Troop 12 Springfield"
        assert user["troops"]["ts"]["roles"]  # the rest of the entry is kept
        assert user["emailDigest"] is True
    assert read("publicSites/troop-12")["troopName"] == "Troop 12 Springfield"


def test_bad_settings_are_refused():
    assert call("save_troop_settings", "lead", {**FORM, "timezone": "UTC"}).status_code == 400
    assert call("save_troop_settings", "lead", {**FORM, "positions": {"committeeChair": "s1"}}).status_code == 400
    assert read(T).get("timezone") is None
