"""Council calendars on the emulators: set_council_calendar checks the troop and the link before reading anything
(the emulator never fetches the internet here), and the daily refresh reads every shared feed (fetch faked, run in
this process)."""

import os

import pytest

from tests.integration.test_functions import call, owner
from tests.integration.test_plan_flow import FUTURE, T
from tests.rules.emulator import read, reset
from tests.unit.test_council_calendar import FEED

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)


@pytest.fixture(autouse=True)
def troop():
    reset()
    owner.set(T, {"unitNumber": "123"})
    for uid, roles in {"leader": ["leader", "scoutmaster"], "parent": ["parent"]}.items():
        owner.set(f"{T}/access/{uid}", {"memberId": f"m-{uid}", "roles": roles, "scoutIds": [], "yptExpiresAt": FUTURE})
    yield


def save(uid: str, url: str):
    return call("set_council_calendar", uid, {"troopId": "t1", "url": url})


def test_only_leaders_save_and_a_council_name_and_a_good_link_come_first():
    assert save("parent", "https://example.org/cal.ics").status_code == 403
    assert "council's name" in save("leader", "https://example.org/cal.ics").text  # no council on the troop yet
    owner.set(T, {"unitNumber": "123", "council": "Bay-Lakes Council"})
    assert save("leader", "http://example.org/cal.ics").status_code == 400
    assert save("leader", "https://127.0.0.1/cal.ics").status_code == 400  # never this machine or its network


def test_the_daily_refresh_reads_every_shared_feed_and_keeps_old_events_when_one_fails():
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    from datetime import UTC, datetime

    from endpoints.council_calendar import refresh_all

    owner.set("councilFeeds/bay-lakes", {"url": "https://good.example/cal.ics", "council": "Bay-Lakes Council"})
    owner.set("councilFeeds/broken", {"url": "https://bad.example/cal.ics", "council": "Broken Council"})
    owner.set("councilEvents/broken", {"events": [{"title": "Kept", "start": "2026-12-01"}]})

    def fetch(url):
        if "bad" in url:
            raise OSError("down")
        return FEED

    assert refresh_all(datetime(2026, 10, 31, 12, tzinfo=UTC), fetch) == 1
    titles = [e["title"] for e in read("councilEvents/bay-lakes")["events"]]
    assert "Fall Camporee, all troops" in titles
    assert read("councilEvents/broken")["events"][0]["title"] == "Kept"
    assert "down" in read("councilFeeds/broken")["lastError"]
