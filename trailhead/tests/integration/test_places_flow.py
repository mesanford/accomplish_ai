"""The place catalog on the emulators: the refresh job saves what its sources give (sources faked, run in this
process like the retention tests), and find_places hands planners and Scouts the places near their troop."""

import os
from datetime import UTC, datetime, timedelta

import pytest

from tests.integration.test_functions import call, owner
from tests.integration.test_plan_flow import FUTURE, T
from tests.rules.emulator import read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)


@pytest.fixture(autouse=True)
def troop():
    reset()
    owner.set(T, {"unitNumber": "123", "meetingPlace": {"city": "Madison", "state": "WI"}})
    for uid, (member, roles, kind) in {
        "leader": ("m-leader", ["leader", "scoutmaster"], "adult"),
        "parent": ("m-parent", ["parent"], "adult"),
        "sam": ("s-sam", ["scout"], "scout"),
    }.items():
        owner.set(f"{T}/access/{uid}", {"memberId": member, "roles": roles, "scoutIds": [], "yptExpiresAt": FUTURE})
        owner.set(f"{T}/members/{member}", {"kind": kind, "displayName": uid.title()})
    yield


def fake_deps():
    from tests.unit.test_places import fake_deps as deps

    return deps({})


def run_job(now):
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    from endpoints import places_job
    from endpoints import places_store as store

    deps = {**fake_deps(), "save": store.save, "stored": store.stored}
    return places_job.work(now, deps)


def test_the_refresh_saves_places_then_waits_six_months_and_records_what_changed():
    now = datetime(2026, 11, 1, tzinfo=UTC)
    stage = run_job(now)
    while stage != "done":
        stage = run_job(now)
    assert read("places/ridb_1")["kind"] == "federal" and read("places/ha_philmont")["kind"] == "highAdventure"
    # 1 campground, a park for each state but Wisconsin (whose own list wins, and is empty here) and 4 bases.
    assert read("catalogMeta/current")["summary"]["added"] == 1 + 50 + 4
    assert run_job(now + timedelta(days=30)) == "not due"
    assert run_job(now + timedelta(days=200)) != "not due"  # six months on, a new run starts


def test_planners_and_scouts_find_places_near_the_troop_and_parents_do_not():
    owner.set("places/ridb_1", {"name": "Pine Lake", "state": "WI", "kind": "federal", "lat": 44.9, "lng": -89.6})
    owner.set("places/ridb_2", {"name": "Far Away", "state": "TX", "kind": "federal", "lat": 30.0, "lng": -97.0})
    owner.set(
        "places/ha_philmont", {"name": "Philmont", "state": "NM", "kind": "highAdventure", "lat": 36.5, "lng": -104.9}
    )
    for uid in ("leader", "sam"):
        response = call("find_places", uid, {"troopId": "t1", "mode": "nearby"})
        assert response.status_code == 200, response.text
        names = [p["name"] for p in response.json()["result"]["places"]]
        assert names == ["Pine Lake"]  # Texas is not next to Wisconsin; bases are listed on their own
    bases = call("find_places", "sam", {"troopId": "t1", "mode": "highAdventure"}).json()["result"]["places"]
    assert [p["name"] for p in bases] == ["Philmont"]
    assert call("find_places", "parent", {"troopId": "t1", "mode": "nearby"}).status_code == 403
