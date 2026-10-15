"""End-to-end: the retention job deletes a troop nobody has used for 18 months, but only with dry run off."""

import os

import pytest

from tests.integration.test_membership_flow import new_scout, new_troop
from tests.integration.test_retention_flow import NOW, TODAY, owner, years_ago
from tests.rules.emulator import list_docs, read, reset
from tests.rules.storage import Storage, reset_storage

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)


@pytest.fixture(autouse=True)
def clean():
    reset()
    reset_storage()
    yield


@pytest.fixture
def run():
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    from endpoints.retention import Budget, run_retention

    return lambda dry_run: run_retention(TODAY, dry_run, Budget())


def idle_troop(number: str, last_active) -> tuple[str, str]:
    tid = new_troop(number)  # the leader is "lead"
    sid = new_scout(tid, "lead", "Sam", 2013)
    t = f"troops/{tid}"
    troop_doc = read(t)
    troop_doc.pop("createdAt", None)
    owner.set(t, {**troop_doc, "lastActiveAt": last_active, "site": {"slug": f"troop-{number}", "published": True}})
    owner.set(f"slugs/troop-{number}", {"troopId": tid})
    owner.set(f"publicSites/troop-{number}", {"troopId": tid, "about": "We camp."})
    owner.set(f"{t}/threads/th1", {"memberIds": [], "participantUids": [], "updatedAt": NOW})
    owner.set(f"{t}/threads/th1/messages/m1", {"body": "hi", "createdAt": NOW})
    owner.set(f"{t}/events/e1/rsvps/{sid}", {"going": True})
    assert Storage("owner").upload(f"cards/{tid}/{sid}/c1/card.png") == 200
    assert Storage("owner").upload(f"sites/{tid}/public/logo.png") == 200
    return tid, sid


def test_dry_run_deletes_nothing(run):
    tid, sid = idle_troop("51", years_ago(2))
    totals = run(dry_run=True)
    assert totals["troopsDue"] == 1 and totals["troops"] == 0
    assert read(f"troops/{tid}") is not None and read(f"troops/{tid}/members/{sid}") is not None
    assert read("slugs/troop-51") is not None
    assert tid in read("users/lead")["troops"]
    assert Storage("owner").download(f"cards/{tid}/{sid}/c1/card.png") == 200


def test_an_idle_troop_is_deleted_entirely_when_dry_run_is_off(run):
    tid, sid = idle_troop("52", years_ago(2))
    active, active_scout = idle_troop("53", years_ago(1))
    totals = run(dry_run=False)
    assert totals["troops"] == 1
    t = f"troops/{tid}"
    assert read(t) is None
    for sub in ("members", "access", "scoutRecords", "threads", "threads/th1/messages", "events/e1/rsvps"):
        assert list_docs(f"{t}/{sub}") == [], sub
    assert read("slugs/troop-52") is None and read("publicSites/troop-52") is None
    assert tid not in read("users/lead")["troops"]  # the login stays, with its other troop
    assert active in read("users/lead")["troops"]
    assert Storage("owner").download(f"cards/{tid}/{sid}/c1/card.png") == 404
    assert Storage("owner").download(f"sites/{tid}/public/logo.png") == 404
    # The troop used a year ago is untouched.
    assert read(f"troops/{active}/members/{active_scout}") is not None
    assert read("slugs/troop-53") is not None
    assert Storage("owner").download(f"cards/{active}/{active_scout}/c1/card.png") == 200
    assert run(dry_run=False)["troops"] == 0  # rerunning is harmless


def test_a_troop_from_before_tracking_starts_its_clock_now(run):
    tid = new_troop("54")
    assert "lastActiveAt" not in read(f"troops/{tid}")
    totals = run(dry_run=False)
    assert totals["troopsDue"] == 0
    assert read(f"troops/{tid}")["activityTrackedSince"]
