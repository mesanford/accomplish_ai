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


NOTICE = "2026-10-17.1"
AGREE = {"consent": True, "consentVersion": NOTICE}


def new_scout(tid: str, caller: str, name: str, year: int) -> str:
    form = {"troopId": tid, "displayName": name, "birthYear": year, "birthMonth": 3, "currentRankId": "first-class"}
    # Leaders confirm permission for Scouts who may be under 13; parents agree to the notice.
    form |= {"leaderConfirmed": True, "consent": True, "consentVersion": NOTICE}
    return ok(call("add_scout", caller, form))["scoutId"]


def test_troop_invite_and_join():
    tid = new_troop("7")
    assert read("users/lead")["troops"][tid]["roles"] == ["leader", "scoutmaster"]
    sid = new_scout(tid, "lead", "Sam", 2012)
    assert read(f"troops/{tid}/scoutRecords/{sid}")["currentRankId"] == "first-class"

    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "parent", "scoutIds": [sid]}))
    assert call("create_invite", "stranger", {"troopId": tid, "role": "leader"}).status_code == 403

    joined = ok(
        call("accept_invite", "mom", {"troopId": tid, "code": invite["code"], "displayName": "Jordan", **AGREE})
    )
    assert read(f"troops/{tid}/access/mom")["scoutIds"] == [sid]
    assert read(f"troops/{tid}/members/{sid}")["guardianIds"] == [joined["memberId"]]
    again = call("accept_invite", "dad", {"troopId": tid, "code": invite["code"], "displayName": "Chris", **AGREE})
    assert again.status_code == 400
    assert "already been used" in again.text

    # The parent can now see their Scout's progress through the security rules.
    owner.set(f"troops/{tid}/progress/{sid}_art", {"scoutId": sid, "awardId": "art", "status": "in_progress"})
    assert Client("mom").get(f"troops/{tid}/progress/{sid}_art") == 200


def test_parent_adds_their_own_scout():
    tid = new_troop("9")
    sid = new_scout(tid, "lead", "Ava", 2013)
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "parent", "scoutIds": [sid]}))
    ok(call("accept_invite", "dad", {"troopId": tid, "code": invite["code"], "displayName": "Chris", **AGREE}))
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
    ok(call("accept_invite", "mom", {"troopId": tid, "code": invite["code"], "displayName": "Jordan", **AGREE}))
    first = ok(call("send_message", "lead", {"troopId": tid, "recipientMemberIds": [sid], "body": "Hi Sam"}))
    reply = ok(call("send_message", "mom", {"troopId": tid, "threadId": first["threadId"], "body": "Thanks!"}))
    assert reply["threadId"] == first["threadId"]
    assert read(f"troops/{tid}/threads/{first['threadId']}")["lastMessage"] == "Thanks!"


def test_completed_blue_card_completes_the_badge():
    card = {"scoutId": "s1", "awardId": "art", "versionId": "v1", "status": "complete", "counselorUid": "mbc"}
    owner.set("troops/t9/blueCards/s1_art", card)
    progress = wait_for(lambda: read("troops/t9/progress/s1_art"))
    assert progress["status"] == "complete"


def parent_invite(tid: str, sid: str) -> dict:
    return ok(call("create_invite", "lead", {"troopId": tid, "role": "parent", "scoutIds": [sid]}))


def test_parent_cannot_join_without_consent():
    tid = new_troop("11")
    sid = new_scout(tid, "lead", "Sam", 2015)
    invite = parent_invite(tid, sid)
    join = {"troopId": tid, "code": invite["code"], "displayName": "Jordan"}
    for extra in (
        {},
        {"consent": False, "consentVersion": NOTICE},
        {"consent": True},
        {"consent": True, "consentVersion": "old"},
    ):
        r = call("accept_invite", "mom", {**join, **extra})
        assert r.status_code == 400, extra
    assert read(f"troops/{tid}/access/mom") is None
    assert read(f"troops/{tid}/invites/{invite['code']}").get("usedBy") is None


def test_parent_consent_is_recorded_for_each_scout():
    tid = new_troop("12")
    sid = new_scout(tid, "lead", "Sam", 2015)
    other = new_scout(tid, "lead", "Ava", 2014)
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "parent", "scoutIds": [sid, other]}))
    ok(call("accept_invite", "mom", {"troopId": tid, "code": invite["code"], "displayName": "Jordan", **AGREE}))
    for scout in (sid, other):
        [consent] = read(f"troops/{tid}/consents/{scout}")["parentConsents"]
        assert consent["uid"] == "mom"
        assert consent["version"] == NOTICE
        assert consent["at"]
    assert read(f"troops/{tid}/invites/{invite['code']}")["consentVersion"] == NOTICE


def test_other_roles_join_without_the_parent_notice():
    tid = new_troop("13")
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "leader"}))
    ok(
        call(
            "accept_invite",
            "asm",
            {"troopId": tid, "code": invite["code"], "displayName": "Alex", "yptExpiresAt": "2027-12-31"},
        )
    )


def test_invite_notice_names_the_troop_and_role():
    tid = new_troop("14")
    sid = new_scout(tid, "lead", "Sam", 2015)
    invite = parent_invite(tid, sid)
    notice = ok(call("invite_notice", "mom", {"troopId": tid, "code": invite["code"]}))
    assert notice == {"troopName": "Troop 14", "role": "parent", "alreadyMember": False}
    assert call("invite_notice", "mom", {"troopId": tid, "code": "nope"}).status_code == 400


def test_leader_confirms_permission_for_a_scout_who_may_be_under_13():
    tid = new_troop("15")
    form = {"troopId": tid, "displayName": "Ava", "birthYear": 2015, "birthMonth": 3, "currentRankId": "scout"}
    assert call("add_scout", "lead", form).status_code == 400
    assert call("add_scout", "lead", {**form, "leaderConfirmed": False}).status_code == 400
    sid = ok(call("add_scout", "lead", {**form, "leaderConfirmed": True}))["scoutId"]
    confirmation = read(f"troops/{tid}/consents/{sid}")["leaderConfirmation"]
    assert confirmation["uid"] == "lead"
    assert confirmation["at"]
    # A Scout who is 13 or older needs no confirmation, and none is recorded.
    older = ok(call("add_scout", "lead", {**form, "displayName": "Max", "birthYear": 2010}))["scoutId"]
    assert read(f"troops/{tid}/consents/{older}") is None


def test_parent_adding_a_scout_must_agree():
    tid = new_troop("16")
    sid = new_scout(tid, "lead", "Ava", 2013)
    invite = parent_invite(tid, sid)
    ok(call("accept_invite", "dad", {"troopId": tid, "code": invite["code"], "displayName": "Chris", **AGREE}))
    form = {"troopId": tid, "displayName": "Max", "birthYear": 2014, "birthMonth": 3, "currentRankId": "scout"}
    assert call("add_scout", "dad", form).status_code == 400
    sibling = ok(call("add_scout", "dad", {**form, **AGREE}))["scoutId"]
    assert read(f"troops/{tid}/consents/{sibling}")["parentConsents"][0]["uid"] == "dad"


def test_parent_withdraws_consent():
    tid = new_troop("17")
    sid = new_scout(tid, "lead", "Sam", 2015)
    other = new_scout(tid, "lead", "Ava", 2015)
    invite = parent_invite(tid, sid)
    ok(call("accept_invite", "mom", {"troopId": tid, "code": invite["code"], "displayName": "Jordan", **AGREE}))
    withdraw = {"troopId": tid, "scoutId": sid}
    assert call("withdraw_parent_consent", "lead", withdraw).status_code == 403
    assert call("withdraw_parent_consent", "stranger", withdraw).status_code == 403
    assert call("withdraw_parent_consent", "mom", {**withdraw, "scoutId": other}).status_code == 403
    ok(call("withdraw_parent_consent", "mom", withdraw))
    ok(call("withdraw_parent_consent", "mom", withdraw))
    doc = read(f"troops/{tid}/consents/{sid}")
    assert doc["withdrawal"]["uid"] == "mom"
    assert doc["parentConsents"]
    assert read(f"troops/{tid}/members/{sid}")["displayName"] == "Sam"  # nothing is deleted
