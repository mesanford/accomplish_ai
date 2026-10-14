"""End-to-end: a leader creates a troop, adds a Scout, invites a parent, and the parent joins."""

import os

import pytest

from tests.integration.test_functions import call, owner, wait_for
from tests.rules.emulator import Client, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)


@pytest.fixture(autouse=True)
def clean():
    reset()
    owner.set("awards/art", {"name": "Art", "currentVersionId": "v1"})
    yield


def ok(response) -> dict:
    assert response.status_code == 200, response.text
    return response.json()["result"]


def new_troop(number: str) -> str:
    form = {"name": f"Troop {number}", "unitNumber": number, "displayName": "Pat", "yptExpiresAt": "2027-12-31"}
    return ok(call("create_troop", "lead", form))["troopId"]


def new_scout(tid: str, caller: str, name: str, year: int) -> str:
    form = {"troopId": tid, "displayName": name, "birthYear": year, "birthMonth": 3, "currentRankId": "first-class"}
    return ok(call("add_scout", caller, form))["scoutId"]


def test_troop_invite_and_join():
    tid = new_troop("7")
    assert read("users/lead")["troops"][tid]["roles"] == ["leader"]
    sid = new_scout(tid, "lead", "Sam", 2012)
    assert read(f"troops/{tid}/scoutRecords/{sid}")["currentRankId"] == "first-class"

    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "parent", "scoutIds": [sid]}))
    assert call("create_invite", "stranger", {"troopId": tid, "role": "leader"}).status_code == 403

    joined = ok(call("accept_invite", "mom", {"troopId": tid, "code": invite["code"], "displayName": "Jordan"}))
    assert read(f"troops/{tid}/access/mom")["scoutIds"] == [sid]
    assert read(f"troops/{tid}/members/{sid}")["guardianIds"] == [joined["memberId"]]
    again = call("accept_invite", "dad", {"troopId": tid, "code": invite["code"], "displayName": "Chris"})
    assert again.status_code == 400
    assert "already been used" in again.text

    # The parent can now see their Scout's progress through the security rules.
    owner.set(f"troops/{tid}/progress/{sid}_art", {"scoutId": sid, "awardId": "art", "status": "in_progress"})
    assert Client("mom").get(f"troops/{tid}/progress/{sid}_art") == 200


def test_parent_adds_their_own_scout():
    tid = new_troop("9")
    sid = new_scout(tid, "lead", "Ava", 2013)
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "parent", "scoutIds": [sid]}))
    ok(call("accept_invite", "dad", {"troopId": tid, "code": invite["code"], "displayName": "Chris"}))
    sibling = new_scout(tid, "dad", "Max", 2014)
    assert sibling in read(f"troops/{tid}/access/dad")["scoutIds"]
    assert read(f"troops/{tid}/members/{sibling}")["guardianIds"]


def test_under_13_scout_cannot_get_a_login():
    tid = new_troop("3")
    sid = new_scout(tid, "lead", "Ava", 2015)
    r = call("create_invite", "lead", {"troopId": tid, "role": "scout", "scoutMemberId": sid})
    assert r.status_code == 400
    assert "under 13" in r.text


def test_leader_invite_needs_current_training():
    tid = new_troop("4")
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "leader"}))
    r = call("accept_invite", "asm", {"troopId": tid, "code": invite["code"], "displayName": "Alex"})
    assert r.status_code == 400
    assert "Youth Protection" in r.text


def test_reply_stays_in_the_thread():
    tid = new_troop("5")
    sid = new_scout(tid, "lead", "Sam", 2012)
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "parent", "scoutIds": [sid]}))
    ok(call("accept_invite", "mom", {"troopId": tid, "code": invite["code"], "displayName": "Jordan"}))
    first = ok(call("send_message", "lead", {"troopId": tid, "recipientMemberIds": [sid], "body": "Hi Sam"}))
    reply = ok(call("send_message", "mom", {"troopId": tid, "threadId": first["threadId"], "body": "Thanks!"}))
    assert reply["threadId"] == first["threadId"]
    assert read(f"troops/{tid}/threads/{first['threadId']}")["lastMessage"] == "Thanks!"


def test_completed_blue_card_completes_the_badge():
    card = {"scoutId": "s1", "awardId": "art", "versionId": "v1", "status": "complete", "counselorUid": "mbc"}
    owner.set("troops/t9/blueCards/s1_art", card)
    progress = wait_for(lambda: read("troops/t9/progress/s1_art"))
    assert progress["status"] == "complete"
