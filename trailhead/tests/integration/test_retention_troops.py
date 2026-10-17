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


def entry(sid: str, day: str, cents: int, kind: str, text: str) -> dict:
    return {"scoutId": sid, "amountCents": cents, "type": kind, "description": text, "date": day, "createdBy": "lead"}


def test_a_retired_troop_keeps_its_books_until_each_entry_is_seven_years_old(run):
    from datetime import date

    from endpoints.retention import Budget, run_retention

    tid, sid = idle_troop("55", years_ago(2))
    t = f"troops/{tid}"
    old_day = date(TODAY.year - 8, 1, 15).isoformat()
    recent_day = date(TODAY.year - 2, 1, 15).isoformat()
    owner.set(f"{t}/ledger/old", entry(sid, old_day, -1000, "charge", "Sam's campout"))
    owner.set(f"{t}/ledger/new", entry(sid, recent_day, 3000, "sale", "Popcorn for Sam"))
    owner.set(f"{t}/accounts/{sid}", {"balanceCents": 3000})

    assert run(dry_run=False)["troops"] == 1
    troop_doc = read(t)
    assert troop_doc["retiredAt"] and troop_doc["name"] and "lastActiveAt" not in troop_doc
    assert list_docs(f"{t}/members") == [] and list_docs(f"{t}/access") == []
    assert read("slugs/troop-55") is None and tid not in read("users/lead")["troops"]
    kept = [read(f"{t}/ledger/{i}") for i in ("old", "new")]
    assert all(e["scoutId"].startswith("former-") and "Sam" not in e["description"] for e in kept)
    assert read(f"{t}/accounts/{sid}") is None  # the Scout's own account is gone; only the reference account stays

    run(dry_run=False)  # the next night: the 8-year-old entry goes, nothing is brought forward
    assert read(f"{t}/ledger/old") is None and read(f"{t}/ledger/new") is not None
    assert not [e for e in list_docs(f"{t}/ledger") if e.get("broughtForward")]

    # Closing Sam's account posted a transfer to the general fund dated today; 8 years on, every entry is past 7.
    later = date(TODAY.year + 8, TODAY.month, min(TODAY.day, 28))
    run_retention(later, False, Budget())
    assert read(t) is None and list_docs(f"{t}/ledger") == [] and list_docs(f"{t}/accounts") == []
