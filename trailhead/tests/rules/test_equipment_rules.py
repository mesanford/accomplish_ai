"""Rules for troop gear: only the quartermaster and leaders write the inventory; members read the catalog; loans and
requests are written by functions only; parents read loans to their own Scout."""

from datetime import UTC, datetime

from .conftest import FUTURE, T
from .emulator import Client

OK, DENIED = 200, 403
owner = Client("owner")
NOW = datetime.now(UTC)
ITEM = f"{T}/inventory/tent4"


def item(**more) -> dict:
    return {
        "name": "Tent 4",
        "category": "tents",
        "quantity": 1,
        "tag": "T-4",
        "location": "Trailer",
        "condition": "good",
        "notes": "",
        "createdAt": NOW,
        "updatedAt": NOW,
        **more,
    }


def seed():
    # A quartermaster, a Scout (13 or older) who is the quartermaster, a plain adult and a second parent.
    for uid, doc in {
        "qm": {"memberId": "m-qm", "roles": ["quartermaster"], "scoutIds": []},
        "scoutqm": {"memberId": "s2", "roles": ["scout", "quartermaster"], "scoutIds": ["s2"]},
        "committee": {"memberId": "m-com", "roles": ["committee"], "scoutIds": [], "yptExpiresAt": FUTURE},
        "parent2": {"memberId": "m-parent2", "roles": ["parent"], "scoutIds": ["s2"]},
    }.items():
        owner.set(f"{T}/access/{uid}", doc)
    owner.set(ITEM, {k: v for k, v in item().items()} | {"out": 0})


def test_quartermaster_and_leaders_add_and_change_items():
    seed()
    for uid in ("qm", "scoutqm", "leader", "assistant", "chair"):
        who = Client(uid)
        assert who.create(f"{T}/inventory/new-{uid}", item()) == OK
        assert who.set(f"{T}/inventory/new-{uid}", item(name="Renamed")) == OK


def test_everyone_else_is_refused_writes_but_reads_the_catalog():
    seed()
    for uid in ("committee", "counselor", "parent", "scout1"):
        who = Client(uid)
        assert who.create(f"{T}/inventory/x-{uid}", item()) == DENIED
        assert who.set(ITEM, item(name="Mine now")) == DENIED
        assert who.delete(ITEM) == DENIED
        assert who.get(ITEM) == OK
    assert Client("stranger").get(ITEM) == DENIED


def test_the_quartermaster_role_grants_nothing_else():
    seed()
    qm = Client("qm")
    assert qm.get(f"{T}/blueCards/s1_chess") == DENIED
    assert qm.get(f"{T}/progress/s1_camping") == DENIED
    assert qm.get(f"{T}/invites/abc") == DENIED
    assert qm.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Changed"}) == DENIED
    assert qm.set(f"{T}/events/e1", {"title": "Campout", "start": "2026-11-06"}) == DENIED
    assert qm.set(f"{T}/documents/d1", {"title": "x"}) == DENIED


def test_an_item_must_be_valid():
    seed()
    qm = Client("qm")
    assert qm.create(f"{T}/inventory/a", item(category="weapons")) == DENIED
    assert qm.create(f"{T}/inventory/b", item(quantity=0)) == DENIED
    assert qm.create(f"{T}/inventory/c", item(quantity=1001)) == DENIED
    assert qm.create(f"{T}/inventory/d", item(condition="broken")) == DENIED
    assert qm.create(f"{T}/inventory/e", item(name="")) == DENIED
    assert qm.create(f"{T}/inventory/f", item(costCents=-5)) == DENIED
    assert qm.create(f"{T}/inventory/g", item(purchaseDate="last spring")) == DENIED
    assert qm.create(f"{T}/inventory/h", item(surprise=True)) == DENIED
    assert qm.create(f"{T}/inventory/i", item(purchaseDate="2024-05-01", costCents=12900)) == OK


def test_the_count_out_and_the_photo_are_written_only_by_the_server():
    seed()
    qm = Client("qm")
    assert qm.create(f"{T}/inventory/o1", item(out=0)) == DENIED
    assert qm.create(f"{T}/inventory/o2", item(photoPath="gear/t1/o2/photo.jpg")) == DENIED
    assert qm.set(ITEM, item(out=1)) == DENIED
    assert qm.set(ITEM, item(photoPath="gear/t1/tent4/photo.jpg", out=0)) == DENIED
    assert qm.set(ITEM, item(out=0, notes="New pole")) == OK  # an unchanged count is fine


def test_quantity_cannot_drop_below_what_is_out_and_an_item_that_is_out_cannot_be_deleted():
    seed()
    owner.set(f"{T}/inventory/kits", item(name="Mess kit", quantity=12, out=5))
    qm = Client("qm")
    assert qm.set(f"{T}/inventory/kits", item(name="Mess kit", quantity=4, out=5)) == DENIED
    assert qm.set(f"{T}/inventory/kits", item(name="Mess kit", quantity=5, out=5)) == OK
    assert qm.delete(f"{T}/inventory/kits") == DENIED
    owner.set(f"{T}/inventory/kits", item(name="Mess kit", quantity=12, out=0))
    assert qm.delete(f"{T}/inventory/kits") == OK


def test_created_time_cannot_be_rewritten():
    seed()
    owner.set(ITEM, item(out=0))
    later = datetime(2030, 1, 1, tzinfo=UTC)
    assert Client("qm").set(ITEM, item(out=0, createdAt=later)) == DENIED


def seed_loans():
    seed()
    base = {"itemId": "tent4", "itemName": "Tent 4", "quantity": 1, "dueDate": "2026-10-24", "status": "out"}
    owner.set(
        f"{T}/checkouts/c-s1", {**base, "toKind": "member", "toMemberId": "s1", "scoutId": "s1", "toLabel": "Sam"}
    )
    owner.set(
        f"{T}/checkouts/c-s2", {**base, "toKind": "member", "toMemberId": "s2", "scoutId": "s2", "toLabel": "Riley"}
    )
    owner.set(f"{T}/checkouts/c-adult", {**base, "toKind": "member", "toMemberId": "m-com", "toLabel": "Casey"})
    owner.set(f"{T}/checkouts/c-event", {**base, "toKind": "event", "eventId": "e1", "toLabel": "Campout"})


def test_loans_are_read_by_managers_the_borrower_and_the_borrowing_scouts_parent():
    seed_loans()
    for uid in ("qm", "leader", "chair"):
        for loan in ("c-s1", "c-s2", "c-adult", "c-event"):
            assert Client(uid).get(f"{T}/checkouts/{loan}") == OK
    assert Client("parent").get(f"{T}/checkouts/c-s1") == OK  # their Scout's loan
    assert Client("parent").get(f"{T}/checkouts/c-s2") == DENIED  # another family's Scout
    assert Client("parent").get(f"{T}/checkouts/c-adult") == DENIED
    assert Client("parent").get(f"{T}/checkouts/c-event") == DENIED
    assert Client("scout1").get(f"{T}/checkouts/c-s1") == OK  # a Scout reads their own
    assert Client("scout1").get(f"{T}/checkouts/c-s2") == DENIED
    assert Client("committee").get(f"{T}/checkouts/c-adult") == OK  # an adult reads their own
    assert Client("committee").get(f"{T}/checkouts/c-s1") == DENIED
    assert Client("counselor").get(f"{T}/checkouts/c-s1") == DENIED


def test_a_parent_who_has_not_agreed_to_the_notice_does_not_see_the_loan():
    seed_loans()
    owner.set(
        f"{T}/access/parent",
        {"memberId": "m-parent", "roles": ["parent"], "scoutIds": ["s1"], "consentPendingScoutIds": ["s1"]},
    )
    assert Client("parent").get(f"{T}/checkouts/c-s1") == DENIED


def test_no_client_writes_a_loan_or_a_request():
    seed_loans()
    loan = {"itemId": "tent4", "itemName": "Tent 4", "quantity": 1, "status": "returned"}
    for uid in ("qm", "leader", "scoutqm", "parent"):
        who = Client(uid)
        assert who.set(f"{T}/checkouts/c-s1", loan) == DENIED
        assert who.create(f"{T}/checkouts/new-{uid}", loan) == DENIED
        assert who.delete(f"{T}/checkouts/c-s1") == DENIED
        assert who.create(f"{T}/equipmentRequests/new-{uid}", {"itemId": "tent4", "status": "approved"}) == DENIED


def test_requests_are_read_by_managers_and_by_the_person_who_asked():
    seed()
    owner.set(f"{T}/equipmentRequests/r1", {"itemId": "tent4", "status": "pending", "requestedByUid": "parent"})
    assert Client("parent").get(f"{T}/equipmentRequests/r1") == OK
    assert Client("qm").get(f"{T}/equipmentRequests/r1") == OK
    assert Client("leader").get(f"{T}/equipmentRequests/r1") == OK
    assert Client("committee").get(f"{T}/equipmentRequests/r1") == DENIED
    assert Client("scout1").get(f"{T}/equipmentRequests/r1") == DENIED


def log(**more) -> dict:
    return {
        "itemId": "tent4",
        "kind": "repair",
        "note": "Patched the floor",
        "date": "2026-10-17",
        "byMemberId": "m-qm",
        "createdAt": NOW,
        **more,
    }


def test_the_repair_log_is_for_managers_and_is_append_only():
    seed()
    qm = Client("qm")
    assert qm.create(f"{T}/maintenance/l1", log()) == OK
    assert qm.set(f"{T}/maintenance/l1", log(note="Rewritten")) == DENIED
    assert qm.create(f"{T}/maintenance/l2", log(costCents=1500)) == OK
    assert qm.create(f"{T}/maintenance/l3", log(byMemberId="m-leader")) == DENIED  # not signed as someone else
    assert qm.create(f"{T}/maintenance/l4", log(kind="returned")) == DENIED  # only the server writes those
    assert qm.create(f"{T}/maintenance/l5", log(itemId="nothing")) == DENIED
    assert qm.create(f"{T}/maintenance/l6", log(note="")) == DENIED
    assert Client("committee").get(f"{T}/maintenance/l1") == DENIED
    assert Client("parent").get(f"{T}/maintenance/l1") == DENIED
    assert Client("leader").get(f"{T}/maintenance/l1") == OK
    assert qm.delete(f"{T}/maintenance/l1") == OK
