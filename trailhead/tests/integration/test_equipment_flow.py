"""End-to-end: the equipment inventory. Check-out and check-in, quantity limits, requests and approval, the
quartermaster role, photos, and what happens to loans when a Scout is erased or an adult deletes their account."""

import base64
import os
from datetime import date

import pytest

from tests.integration.test_functions import call, owner
from tests.integration.test_membership_flow import AGREE, new_scout, new_troop, ok
from tests.rules.emulator import Client, list_docs, read, reset
from tests.rules.storage import PNG, Storage, reset_storage

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
DUE = "2099-12-31"


@pytest.fixture(autouse=True)
def clean():
    reset()
    reset_storage()
    yield


def join(tid: str, uid: str, role: str, name: str, **invite) -> str:
    code = ok(call("create_invite", "lead", {"troopId": tid, "role": role, **invite}))["code"]
    agree = AGREE if role == "parent" else {}
    return ok(call("accept_invite", uid, {"troopId": tid, "code": code, "displayName": name, **agree}))["memberId"]


def troop_with_gear(number: str) -> dict:
    """A troop with the leader "lead", the quartermaster "quinn", the Scout Sam (login "sam"), his parent "mom",
    a tent, 12 mess kits and an event."""
    tid = new_troop(number)
    sam = new_scout(tid, "lead", "Sam", 2012)
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "scout", "scoutMemberId": sam}))
    ok(call("accept_invite", "sam", {"troopId": tid, "code": invite["code"], "displayName": "Sam"}))
    t = f"troops/{tid}"
    base = {"condition": "good", "location": "Trailer", "notes": "", "out": 0}
    owner.set(f"{t}/inventory/tent", {**base, "name": "Tent 4", "category": "tents", "quantity": 1, "tag": "T-4"})
    owner.set(f"{t}/inventory/kits", {**base, "name": "Mess kit", "category": "cooking", "quantity": 12})
    owner.set(f"{t}/events/e1", {"title": "Fall campout", "start": "2099-11-06", "endDate": "2099-11-08"})
    return {
        "tid": tid,
        "t": t,
        "sam": sam,
        "quinn": join(tid, "quinn", "quartermaster", "Quinn"),
        "mom": join(tid, "mom", "parent", "Jordan", scoutIds=[sam]),
    }


def out(tid: str, who: str, item: str, **more) -> object:
    return call("check_out_item", who, {"troopId": tid, "itemId": item, "dueDate": DUE, **more})


def test_check_out_and_check_in_a_single_tracked_item():
    g = troop_with_gear("61")
    t, tid = g["t"], g["tid"]
    for who in ("mom", "sam", "stranger"):
        assert out(tid, who, "tent", memberId=g["sam"]).status_code == 403
    loan_id = ok(out(tid, "quinn", "tent", memberId=g["sam"]))["checkoutId"]
    loan = read(f"{t}/checkouts/{loan_id}")
    assert loan["status"] == "out" and loan["toLabel"] == "Sam" and loan["scoutId"] == g["sam"]
    assert loan["itemName"] == "Tent 4" and loan["itemTag"] == "T-4" and loan["dueDate"] == DUE
    assert read(f"{t}/inventory/tent")["out"] == 1
    second = out(tid, "lead", "tent", memberId=g["quinn"])
    assert second.status_code == 400 and "None of that item is on the shelf" in second.text

    # Sam and his parent read the loan; another login does not.
    assert Client("mom").get(f"{t}/checkouts/{loan_id}") == 200
    assert Client("sam").get(f"{t}/checkouts/{loan_id}") == 200
    assert Client("stranger").get(f"{t}/checkouts/{loan_id}") == 403

    args = {"troopId": tid, "checkoutId": loan_id}
    assert call("check_in_item", "mom", args).status_code == 403
    assert call("check_in_item", "quinn", {**args, "condition": "broken"}).status_code == 400
    ok(call("check_in_item", "quinn", {**args, "condition": "needs_repair", "note": "Torn flap"}))
    back = read(f"{t}/checkouts/{loan_id}")
    assert back["status"] == "returned" and back["returnCondition"] == "needs_repair" and back["returnNote"]
    tent = read(f"{t}/inventory/tent")
    assert tent["out"] == 0 and tent["condition"] == "needs_repair"  # one tracked item takes the returned condition
    notes = list_docs(f"{t}/maintenance")
    assert len(notes) == 1 and notes[0]["itemId"] == "tent" and "Torn flap" in notes[0]["note"]
    assert call("check_in_item", "quinn", args).status_code == 400  # already back


def test_quantity_items_cannot_go_out_past_what_is_on_the_shelf():
    g = troop_with_gear("62")
    tid, t = g["tid"], g["t"]
    first = ok(out(tid, "quinn", "kits", memberId=g["sam"], quantity=10))["checkoutId"]
    too_many = out(tid, "quinn", "kits", eventId="e1", quantity=3)
    assert too_many.status_code == 400 and "Only 2 on the shelf" in too_many.text
    assert read(f"{t}/inventory/kits")["out"] == 10
    ok(out(tid, "quinn", "kits", eventId="e1", quantity=2))
    assert read(f"{t}/inventory/kits")["out"] == 12
    ok(call("check_in_item", "quinn", {"troopId": tid, "checkoutId": first}))
    assert read(f"{t}/inventory/kits")["out"] == 2
    assert read(f"{t}/inventory/kits")["condition"] == "good"  # a quantity item keeps its own condition


def test_check_out_refuses_bad_terms():
    g = troop_with_gear("63")
    tid = g["tid"]
    assert out(tid, "quinn", "kits").status_code == 400  # nobody to lend to
    assert out(tid, "quinn", "kits", memberId=g["sam"], eventId="e1").status_code == 400
    assert out(tid, "quinn", "kits", memberId=g["sam"], quantity=0).status_code == 400
    assert out(tid, "quinn", "kits", memberId="nobody").status_code == 400
    assert out(tid, "quinn", "kits", eventId="nowhere").status_code == 400
    assert out(tid, "quinn", "ghost", memberId=g["sam"]).status_code == 400
    assert out(tid, "quinn", "kits", memberId=g["sam"], dueDate="2001-01-01").status_code == 400
    owner.set(
        f"{g['t']}/inventory/old", {"name": "Old stove", "category": "cooking", "quantity": 1, "condition": "retired"}
    )
    assert "retired" in out(tid, "quinn", "old", memberId=g["sam"]).text


def test_a_member_requests_an_item_for_an_event_and_the_quartermaster_answers():
    g = troop_with_gear("64")
    tid, t = g["tid"], g["t"]
    ask = {"troopId": tid, "itemId": "kits", "eventId": "e1", "quantity": 4, "note": "For my patrol"}
    assert call("request_item", "stranger", ask).status_code == 403
    assert call("request_item", "sam", {**ask, "eventId": "nowhere"}).status_code == 400
    assert call("request_item", "sam", {**ask, "quantity": 0}).status_code == 400
    request_id = ok(call("request_item", "sam", ask))["requestId"]
    asked = read(f"{t}/equipmentRequests/{request_id}")
    assert asked["status"] == "pending" and asked["requestedByName"] == "Sam" and asked["eventTitle"] == "Fall campout"
    assert read(f"{t}/inventory/kits")["out"] == 0  # nothing leaves until it is approved
    assert Client("sam").get(f"{t}/equipmentRequests/{request_id}") == 200
    assert Client("mom").get(f"{t}/equipmentRequests/{request_id}") == 403

    decide = {"troopId": tid, "requestId": request_id, "approve": True}
    for who in ("sam", "mom"):
        assert call("decide_request", who, decide).status_code == 403
    assert call("decide_request", "quinn", {**decide, "approve": "yes"}).status_code == 400
    loan_id = ok(call("decide_request", "quinn", decide))["checkoutId"]
    loan = read(f"{t}/checkouts/{loan_id}")
    assert loan["toKind"] == "event" and loan["eventId"] == "e1" and loan["quantity"] == 4
    assert loan["dueDate"] == "2099-11-09" and loan["requestId"] == request_id  # the day after the event ends
    assert read(f"{t}/inventory/kits")["out"] == 4
    assert read(f"{t}/equipmentRequests/{request_id}")["status"] == "approved"
    assert call("decide_request", "quinn", decide).status_code == 400  # answered already


def test_a_declined_request_takes_nothing_and_an_approval_cannot_overdraw_the_shelf():
    g = troop_with_gear("65")
    tid, t = g["tid"], g["t"]
    ask = {"troopId": tid, "itemId": "kits", "eventId": "e1"}
    declined = ok(call("request_item", "sam", {**ask, "quantity": 2}))["requestId"]
    ok(
        call(
            "decide_request",
            "lead",
            {"troopId": tid, "requestId": declined, "approve": False, "note": "Out for repair"},
        )
    )
    assert read(f"{t}/equipmentRequests/{declined}")["status"] == "declined"
    assert read(f"{t}/inventory/kits")["out"] == 0
    big = ok(call("request_item", "sam", {**ask, "quantity": 9}))["requestId"]
    ok(out(tid, "quinn", "kits", memberId=g["quinn"], quantity=8))
    refused = call("decide_request", "quinn", {"troopId": tid, "requestId": big, "approve": True})
    assert refused.status_code == 400 and "Only 4 on the shelf" in refused.text
    assert read(f"{t}/equipmentRequests/{big}")["status"] == "pending"


def test_photos_are_stored_cleaned_and_can_be_removed():
    g = troop_with_gear("66")
    tid = g["tid"]
    photo = base64.b64encode(PNG).decode()
    args = {"troopId": tid, "itemId": "tent"}
    assert call("set_item_photo", "mom", {**args, "photo": photo}).status_code == 403
    assert call("set_item_photo", "quinn", {**args, "photo": "not base64!"}).status_code == 400
    assert call("set_item_photo", "quinn", {**args, "photo": base64.b64encode(b"hello").decode()}).status_code == 400
    path = ok(call("set_item_photo", "quinn", {**args, "photo": photo}))["photoPath"]
    assert path.startswith(f"gear/{tid}/tent/photo.") and read(f"{g['t']}/inventory/tent")["photoPath"] == path
    assert Storage("owner").download(path) == 200
    assert Storage("sam").download(path) == 200 and Storage("stranger").download(path) == 403
    assert Storage("quinn").upload(f"gear/{tid}/tent/own.png") == 403  # only the function writes
    assert ok(call("set_item_photo", "quinn", {**args, "remove": True})) == {"photoPath": None}
    assert Storage("owner").download(path) == 404 and "photoPath" not in read(f"{g['t']}/inventory/tent")


def test_a_leader_makes_a_scout_the_quartermaster():
    g = troop_with_gear("67")
    tid, t = g["tid"], g["t"]
    grant = {"troopId": tid, "memberId": g["sam"], "quartermaster": True}
    assert call("set_scout_quartermaster", "mom", grant).status_code == 403
    assert out(tid, "sam", "tent", memberId=g["sam"]).status_code == 403  # not yet
    ok(call("set_scout_quartermaster", "lead", grant))
    assert read(f"{t}/access/sam")["roles"] == ["scout", "quartermaster"]
    assert read(f"{t}/members/{g['sam']}")["roles"] == ["scout", "quartermaster"]
    assert read("users/sam")["troops"][tid]["roles"] == ["scout", "quartermaster"]
    ok(out(tid, "sam", "tent", memberId=g["quinn"]))  # the Scout quartermaster lends gear
    assert call("remove_scout", "sam", {"troopId": tid, "scoutId": g["sam"], "confirm": True}).status_code == 403
    assert Client("sam").get(f"{t}/blueCards/anything") == 403  # and gets nothing else
    ok(call("set_scout_quartermaster", "lead", {**grant, "quartermaster": False}))
    assert read(f"{t}/access/sam")["roles"] == ["scout"]
    assert out(tid, "sam", "kits", memberId=g["quinn"]).status_code == 403


def test_a_scout_under_13_or_without_a_login_cannot_be_the_quartermaster():
    g = troop_with_gear("68")
    tid, t = g["tid"], g["t"]
    young = new_scout(tid, "lead", "Eli", date.today().year - 10)  # 10 years old
    args = {"troopId": tid, "memberId": young, "quartermaster": True}
    assert call("set_scout_quartermaster", "lead", args).status_code == 400  # no login yet
    # Even with a login (set up directly here), a Scout under 13 can't hold the role.
    owner.set(f"{t}/members/{young}", {**read(f"{t}/members/{young}"), "uid": "eli"})
    owner.set(f"{t}/access/eli", {"memberId": young, "roles": ["scout"], "scoutIds": [young]})
    refused = call("set_scout_quartermaster", "lead", args)
    assert refused.status_code == 400 and "13 or older" in refused.text
    assert read(f"{t}/access/eli")["roles"] == ["scout"]
    assert call("set_scout_quartermaster", "lead", {**args, "memberId": g["quinn"]}).status_code == 400  # an adult
    assert call("set_scout_quartermaster", "lead", {**args, "quartermaster": "yes"}).status_code == 400


def test_erasing_a_scout_leaves_their_loans_as_former_scout():
    g = troop_with_gear("69")
    tid, t = g["tid"], g["t"]
    other = new_scout(tid, "lead", "Ava", 2012)
    mine = ok(out(tid, "quinn", "kits", memberId=g["sam"], quantity=3))["checkoutId"]
    theirs = ok(out(tid, "quinn", "kits", memberId=other, quantity=2))["checkoutId"]
    returned = ok(out(tid, "quinn", "tent", memberId=g["sam"]))["checkoutId"]
    ok(call("check_in_item", "quinn", {"troopId": tid, "checkoutId": returned}))
    asked = ok(call("request_item", "sam", {"troopId": tid, "itemId": "kits", "eventId": "e1"}))["requestId"]
    assert Client("mom").get(f"{t}/checkouts/{mine}") == 200

    ok(call("remove_scout", "lead", {"troopId": tid, "scoutId": g["sam"], "confirm": True}))  # open loans block nothing
    for loan_id in (mine, returned):
        loan = read(f"{t}/checkouts/{loan_id}")
        assert loan["toLabel"] == "Former Scout" and loan["holderFormer"] is True
        assert "toMemberId" not in loan and "scoutId" not in loan
    still_out = read(f"{t}/checkouts/{mine}")
    assert still_out["status"] == "out" and still_out["quantity"] == 3 and still_out["itemName"] == "Mess kit"
    assert read(f"{t}/inventory/kits")["out"] == 5  # the kits are still out, to a former Scout
    request = read(f"{t}/equipmentRequests/{asked}")
    assert request["requestedByName"] == "Former Scout" and "requestedByUid" not in request
    assert "requestedByMemberId" not in request
    assert "Sam" not in str(read(f"{t}/checkouts/{mine}")) + str(request)
    assert Client("mom").get(f"{t}/checkouts/{mine}") == 403  # linked to no Scout any more
    assert read(f"{t}/checkouts/{theirs}")["toLabel"] == "Ava"  # other Scouts are untouched
    # The quartermaster can still check the kits in.
    ok(call("check_in_item", "quinn", {"troopId": tid, "checkoutId": mine}))
    assert read(f"{t}/inventory/kits")["out"] == 2


def test_deleting_an_adult_account_leaves_their_loans_as_former_member():
    g = troop_with_gear("70")
    tid, t = g["tid"], g["t"]
    owner_loan = ok(out(tid, "lead", "kits", memberId=g["quinn"], quantity=1))["checkoutId"]
    made_by_quinn = ok(out(tid, "quinn", "tent", memberId=g["sam"]))["checkoutId"]
    assert call("delete_account", "quinn", {"confirm": True}).status_code == 200
    gone = read(f"{t}/checkouts/{owner_loan}")
    assert gone["toLabel"] == "Former member" and "toMemberId" not in gone and gone["status"] == "out"
    assert "outById" not in read(f"{t}/checkouts/{made_by_quinn}")
    assert read(f"{t}/checkouts/{made_by_quinn}")["toLabel"] == "Sam"  # the Scout's loan is untouched
    assert "Quinn" not in str(list_docs(f"{t}/checkouts"))
