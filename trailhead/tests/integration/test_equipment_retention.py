"""End-to-end: equipment history is deleted 7 years after it closed, and the inventory goes with an idle troop."""

import os

import pytest

from tests.integration.test_membership_flow import new_troop
from tests.integration.test_retention_flow import TODAY, owner, years_ago
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

    return lambda dry_run=True, **limits: run_retention(TODAY, dry_run, Budget(**limits))


def seed_history(t: str) -> None:
    item = {"name": "Tent 4", "category": "tents", "quantity": 1, "condition": "good", "out": 0}
    owner.set(f"{t}/inventory/tent", item)
    loan = {"itemId": "tent", "itemName": "Tent 4", "quantity": 1, "toLabel": "Former Scout", "status": "returned"}
    owner.set(f"{t}/checkouts/old", {**loan, "returnedAt": years_ago(7.2)})
    owner.set(f"{t}/checkouts/recent", {**loan, "returnedAt": years_ago(6.5)})
    owner.set(f"{t}/checkouts/open-and-old", {**loan, "status": "out", "outAt": years_ago(8)})  # still out: kept
    ask = {"itemId": "tent", "status": "approved", "requestedByName": "Former Scout"}
    owner.set(f"{t}/equipmentRequests/old", {**ask, "decidedAt": years_ago(7.5)})
    owner.set(f"{t}/equipmentRequests/recent", {**ask, "decidedAt": years_ago(1)})
    owner.set(f"{t}/equipmentRequests/pending", {**ask, "status": "pending", "createdAt": years_ago(9)})  # kept
    note = {"itemId": "tent", "kind": "repair", "note": "Patched floor", "date": "2019-01-01"}
    owner.set(f"{t}/maintenance/old", {**note, "createdAt": years_ago(7.1)})
    owner.set(f"{t}/maintenance/recent", {**note, "createdAt": years_ago(2)})


def test_history_older_than_seven_years_is_deleted_and_the_rest_is_kept(run):
    t = f"troops/{new_troop('81')}"
    seed_history(t)
    totals = run()
    assert totals["equipment"] == 3
    assert read(f"{t}/checkouts/old") is None and read(f"{t}/equipmentRequests/old") is None
    assert read(f"{t}/maintenance/old") is None
    for kept in ("checkouts/recent", "checkouts/open-and-old", "equipmentRequests/recent", "equipmentRequests/pending"):
        assert read(f"{t}/{kept}") is not None, kept
    assert read(f"{t}/maintenance/recent") is not None
    assert read(f"{t}/inventory/tent") is not None  # items are never deleted by age
    assert run()["equipment"] == 0  # rerunning finds nothing more


def test_the_equipment_rule_is_bounded_per_run(run):
    t = f"troops/{new_troop('82')}"
    for n in range(5):
        owner.set(f"{t}/maintenance/n{n}", {"itemId": "x", "note": "old", "createdAt": years_ago(8)})
    assert run(equipment=2)["equipment"] == 2
    assert len(list_docs(f"{t}/maintenance")) == 3


def test_an_idle_troop_takes_its_inventory_and_gear_photos_with_it(run):
    tid = new_troop("83")
    t = f"troops/{tid}"
    troop_doc = read(t)
    troop_doc.pop("createdAt", None)
    owner.set(t, {**troop_doc, "lastActiveAt": years_ago(2)})
    seed_history(t)
    assert Storage("owner").upload(f"gear/{tid}/tent/photo.png") == 200
    assert run(dry_run=True)["troops"] == 0
    assert Storage("owner").download(f"gear/{tid}/tent/photo.png") == 200  # dry run deletes nothing
    assert run(dry_run=False)["troops"] == 1
    for sub in ("inventory", "checkouts", "equipmentRequests", "maintenance"):
        assert list_docs(f"{t}/{sub}") == [], sub
    assert Storage("owner").download(f"gear/{tid}/tent/photo.png") == 404
