"""End-to-end: one person holding several roles in a troop (a leader who is also a parent, and so on)."""

import os
from datetime import UTC, datetime, timedelta

import pytest

from tests.integration.test_functions import call, owner
from tests.integration.test_membership_flow import AGREE, NOTICE, new_scout, new_troop, ok
from tests.rules.emulator import Client, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
YPT = "2027-12-31"


@pytest.fixture(autouse=True)
def clean():
    reset()
    owner.set("awards/art", {"name": "Art", "currentVersionId": "v1"})
    yield


def child_form(tid: str, name: str = "Ava", year: int = 2013) -> dict:
    return {"troopId": tid, "displayName": name, "birthYear": year, "birthMonth": 3, "currentRankId": "scout"}


def join(tid: str, uid: str, role: str, scouts: list[str] | None = None, **extra) -> dict:
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": role, "scoutIds": scouts or []}))
    form = {"troopId": tid, "code": invite["code"], "displayName": uid.title(), **extra}
    return ok(call("accept_invite", uid, form))


def roles_everywhere(tid: str, uid: str) -> list[str]:
    access = read(f"troops/{tid}/access/{uid}")
    member = read(f"troops/{tid}/members/{access['memberId']}")
    assert member["roles"] == access["roles"] == read(f"users/{uid}")["troops"][tid]["roles"]
    return access["roles"]


def test_a_leader_adds_their_own_child():
    tid = new_troop("21")
    me = read(f"troops/{tid}/access/lead")["memberId"]
    assert call("add_scout", "lead", {**child_form(tid), "isMyChild": True}).status_code == 400  # must agree
    sid = ok(call("add_scout", "lead", {**child_form(tid), "isMyChild": True, **AGREE}))["scoutId"]
    assert roles_everywhere(tid, "lead") == ["leader", "scoutmaster", "parent"]
    assert read(f"troops/{tid}/access/lead")["scoutIds"] == [sid]
    assert read(f"troops/{tid}/members/{sid}")["guardianIds"] == [me]
    [consent] = read(f"troops/{tid}/consents/{sid}")["parentConsents"]
    assert consent["uid"] == "lead" and consent["version"] == NOTICE
    assert "leaderConfirmation" not in read(f"troops/{tid}/consents/{sid}")

    # Without the box ticked, nothing links, even for a leader who is a parent.
    other = ok(call("add_scout", "lead", {**child_form(tid, "Max", 2010), "leaderConfirmed": True}))["scoutId"]
    assert read(f"troops/{tid}/members/{other}")["guardianIds"] == []
    assert read(f"troops/{tid}/access/lead")["scoutIds"] == [sid]


def test_a_leader_links_themselves_to_an_existing_scout():
    tid = new_troop("22")
    sid = new_scout(tid, "lead", "Sam", 2012)
    link = {"troopId": tid, "scoutId": sid}
    join(tid, "mom", "parent", [sid], **AGREE)
    assert call("link_self_as_parent", "mom", {**link, **AGREE}).status_code == 403  # leaders only
    assert call("link_self_as_parent", "lead", link).status_code == 400
    assert call("link_self_as_parent", "lead", {**link, "consent": True, "consentVersion": "old"}).status_code == 400
    assert call("link_self_as_parent", "lead", {**link, "scoutId": "nope", **AGREE}).status_code == 404
    ok(call("link_self_as_parent", "lead", {**link, **AGREE}))
    assert roles_everywhere(tid, "lead") == ["leader", "scoutmaster", "parent"]
    assert read(f"troops/{tid}/access/lead")["scoutIds"] == [sid]
    members = read(f"troops/{tid}/members/{sid}")["guardianIds"]
    assert read(f"troops/{tid}/access/lead")["memberId"] in members and len(members) == 2
    assert {c["uid"] for c in read(f"troops/{tid}/consents/{sid}")["parentConsents"]} == {"mom", "lead"}
    again = call("link_self_as_parent", "lead", {**link, **AGREE})
    assert again.status_code == 400 and "already linked" in again.text


def test_only_leaders_change_roles_and_the_last_leader_stays():
    tid = new_troop("23")
    sid = new_scout(tid, "lead", "Sam", 2012)
    join(tid, "mom", "parent", [sid], **AGREE)
    lead_id = read(f"troops/{tid}/access/lead")["memberId"]
    mom_id = read(f"troops/{tid}/access/mom")["memberId"]
    assert call("set_member_roles", "mom", {"troopId": tid, "memberId": mom_id, "roles": ["parent"]}).status_code == 403
    for roles in ([], ["scout"], ["boss"]):
        assert call("set_member_roles", "lead", {"troopId": tid, "memberId": mom_id, "roles": roles}).status_code == 400
    last = call("set_member_roles", "lead", {"troopId": tid, "memberId": lead_id, "roles": ["committee"]})
    assert last.status_code == 400
    assert "at least one leader" in last.text
    assert read(f"troops/{tid}/access/lead")["roles"] == ["leader", "scoutmaster"]
    # Giving up the role is fine once someone else leads, and then that person is the last one.
    chair = {"troopId": tid, "memberId": mom_id, "roles": ["advancement", "parent"], "yptExpiresAt": YPT}
    ok(call("set_member_roles", "lead", {**chair, "scoutIds": [sid]}))
    ok(call("set_member_roles", "lead", {"troopId": tid, "memberId": lead_id, "roles": ["committee"]}))
    stuck = call("set_member_roles", "mom", {"troopId": tid, "memberId": mom_id, "roles": ["parent"]})
    assert stuck.status_code == 400 and "at least one leader" in stuck.text
    # A Scout's roles are not edited here.
    scout_login = call("set_member_roles", "mom", {"troopId": tid, "memberId": sid, "roles": ["parent"]})
    assert scout_login.status_code == 400


def test_training_is_required_for_roles_that_need_it():
    tid = new_troop("24")
    sid = new_scout(tid, "lead", "Sam", 2012)
    join(tid, "mom", "parent", [sid], **AGREE)
    mom_id = read(f"troops/{tid}/access/mom")["memberId"]
    change = {"troopId": tid, "memberId": mom_id, "roles": ["counselor", "parent"], "scoutIds": [sid]}
    refused = call("set_member_roles", "lead", change)
    assert refused.status_code == 400 and "Youth Protection" in refused.text
    assert "Add a current date" in refused.text
    expired = call("set_member_roles", "lead", {**change, "yptExpiresAt": "2020-01-01"})
    assert expired.status_code == 400 and "expired" in expired.text
    assert read(f"troops/{tid}/access/mom")["roles"] == ["parent"]
    ok(call("set_member_roles", "lead", {**change, "yptExpiresAt": YPT}))
    assert roles_everywhere(tid, "mom") == ["counselor", "parent"]
    assert read(f"troops/{tid}/access/mom")["yptExpiresAt"][:10] == YPT
    assert read(f"troops/{tid}/members/{mom_id}")["yptExpiresAt"][:10] == YPT
    # Roles held already are not checked again, so dropping to parent and back needs the date only once.
    ok(call("set_member_roles", "lead", {"troopId": tid, "memberId": mom_id, "roles": ["counselor"]}))
    assert roles_everywhere(tid, "mom") == ["counselor"]
    assert read(f"troops/{tid}/access/mom")["scoutIds"] == []


def test_a_parent_added_by_a_leader_agrees_themselves_before_they_see_the_scout():
    tid = new_troop("25")
    sid = new_scout(tid, "lead", "Sam", 2012)
    other = new_scout(tid, "lead", "Ava", 2012)
    join(tid, "asm", "committee", yptExpiresAt=YPT)
    asm_id = read(f"troops/{tid}/access/asm")["memberId"]
    change = {"troopId": tid, "memberId": asm_id, "roles": ["committee", "parent"]}
    assert call("set_member_roles", "lead", change).status_code == 400  # which Scouts?
    assert call("set_member_roles", "lead", {**change, "scoutIds": ["nope"]}).status_code == 400
    result = ok(call("set_member_roles", "lead", {**change, "scoutIds": [sid]}))
    assert result["pendingScoutIds"] == [sid]
    assert roles_everywhere(tid, "asm") == ["committee", "parent"]
    access = read(f"troops/{tid}/access/asm")
    assert access["scoutIds"] == [sid] and access["consentPendingScoutIds"] == [sid]
    # Until they agree, only leaders (who read access records) see the link; the troop-wide roster does not.
    assert read(f"troops/{tid}/members/{sid}")["guardianIds"] == []
    assert (read(f"troops/{tid}/consents/{sid}") or {}).get("parentConsents", []) == []  # nothing recorded for them

    owner.set(f"troops/{tid}/progress/{sid}_art", {"scoutId": sid, "awardId": "art", "status": "in_progress"})
    assert Client("asm").get(f"troops/{tid}/progress/{sid}_art") == 403
    assert call("withdraw_parent_consent", "asm", {"troopId": tid, "scoutId": sid}).status_code == 403

    assert call("answer_pending_consent", "asm", {"troopId": tid, "consent": True}).status_code == 400
    ok(call("answer_pending_consent", "asm", {"troopId": tid, "consent": True, "consentVersion": NOTICE}))
    access = read(f"troops/{tid}/access/asm")
    assert "consentPendingScoutIds" not in access and access["scoutIds"] == [sid]
    [consent] = read(f"troops/{tid}/consents/{sid}")["parentConsents"]
    assert consent["uid"] == "asm" and consent["version"] == NOTICE
    assert read(f"troops/{tid}/members/{sid}")["guardianIds"] == [asm_id]  # agreed: now shown as the parent
    assert Client("asm").get(f"troops/{tid}/progress/{sid}_art") == 200

    # Adding a second Scout makes only that one pending; the first keeps working.
    ok(call("set_member_roles", "lead", {**change, "scoutIds": [other]}))
    access = read(f"troops/{tid}/access/asm")
    assert access["scoutIds"] == [sid, other] and access["consentPendingScoutIds"] == [other]
    assert read(f"troops/{tid}/members/{other}")["guardianIds"] == []


def test_a_parent_can_decline_and_is_unlinked():
    tid = new_troop("26")
    sid = new_scout(tid, "lead", "Sam", 2012)
    join(tid, "asm", "counselor", yptExpiresAt=YPT)
    asm_id = read(f"troops/{tid}/access/asm")["memberId"]
    ok(
        call(
            "set_member_roles",
            "lead",
            {"troopId": tid, "memberId": asm_id, "roles": ["counselor", "parent"], "scoutIds": [sid]},
        )
    )
    ok(call("answer_pending_consent", "asm", {"troopId": tid, "consent": False}))
    assert roles_everywhere(tid, "asm") == ["counselor"]
    access = read(f"troops/{tid}/access/asm")
    assert access["scoutIds"] == [] and "consentPendingScoutIds" not in access
    assert read(f"troops/{tid}/members/{sid}")["guardianIds"] == []
    assert (read(f"troops/{tid}/consents/{sid}") or {}).get("parentConsents", []) == []
    ok(call("answer_pending_consent", "asm", {"troopId": tid, "consent": False}))  # nothing left to answer


def test_removing_parent_unlinks_every_scout():
    tid = new_troop("27")
    sid = new_scout(tid, "lead", "Sam", 2012)
    other = new_scout(tid, "lead", "Ava", 2012)
    join(tid, "mom", "parent", [sid, other], **AGREE)
    mom_id = read(f"troops/{tid}/access/mom")["memberId"]
    ok(
        call(
            "set_member_roles",
            "lead",
            {"troopId": tid, "memberId": mom_id, "roles": ["committee"], "yptExpiresAt": YPT},
        )
    )
    assert roles_everywhere(tid, "mom") == ["committee"]
    assert read(f"troops/{tid}/access/mom")["scoutIds"] == []
    for scout in (sid, other):
        assert read(f"troops/{tid}/members/{scout}")["guardianIds"] == []


def test_an_existing_member_accepts_an_invite_for_another_role():
    tid = new_troop("28")
    sid = new_scout(tid, "lead", "Sam", 2012)
    # The leader accepts a parent invite from themselves, as a second login step on their own account.
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "parent", "scoutIds": [sid]}))
    form = {"troopId": tid, "code": invite["code"]}
    assert call("accept_invite", "lead", form).status_code == 400  # must agree
    assert read(f"troops/{tid}/invites/{invite['code']}").get("usedBy") is None
    ok(call("accept_invite", "lead", {**form, **AGREE}))
    assert roles_everywhere(tid, "lead") == ["leader", "scoutmaster", "parent"]
    assert read(f"troops/{tid}/access/lead")["scoutIds"] == [sid]
    assert len(read(f"troops/{tid}/members/{sid}")["guardianIds"]) == 1
    assert [c["uid"] for c in read(f"troops/{tid}/consents/{sid}")["parentConsents"]] == ["lead"]
    assert read(f"troops/{tid}/invites/{invite['code']}")["usedBy"] == "lead"
    assert call("accept_invite", "lead", {**form, **AGREE}).status_code == 400  # single use

    # A parent takes a counselor role: needs a training date, and gets no second member record.
    join(tid, "mom", "parent", [sid], **AGREE)
    counselor = ok(call("create_invite", "lead", {"troopId": tid, "role": "counselor"}))
    ask = {"troopId": tid, "code": counselor["code"]}
    assert call("accept_invite", "mom", ask).status_code == 400
    ok(call("accept_invite", "mom", {**ask, "yptExpiresAt": YPT}))
    assert roles_everywhere(tid, "mom") == ["counselor", "parent"]
    assert len(list_docs(f"troops/{tid}/members")) == 3  # the leader, the Scout and one record for mom

    # Holding the role already, or being a Scout, is refused. A Scout invite is for a separate login.
    again = ok(call("create_invite", "lead", {"troopId": tid, "role": "counselor"}))
    assert call("accept_invite", "mom", {"troopId": tid, "code": again["code"]}).status_code == 400
    scout_invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "scout", "scoutMemberId": sid}))
    refused = call("accept_invite", "mom", {"troopId": tid, "code": scout_invite["code"]})
    assert refused.status_code == 400 and "already a member" in refused.text
    notice = ok(call("invite_notice", "mom", {"troopId": tid, "code": scout_invite["code"]}))
    assert notice["alreadyMember"] is True


def test_a_leader_who_is_a_parent_has_the_family_exception_in_messages():
    tid = new_troop("29")
    own = ok(call("add_scout", "lead", {**child_form(tid), "isMyChild": True, **AGREE}))["scoutId"]
    other = new_scout(tid, "lead", "Max", 2010)
    lead_id = read(f"troops/{tid}/access/lead")["memberId"]
    lapsed = datetime.now(UTC) - timedelta(days=30)
    for path in (f"troops/{tid}/members/{lead_id}", f"troops/{tid}/access/lead"):
        owner.set(path, {**read(path), "yptExpiresAt": lapsed})
    # Their own child: no training needed.
    ok(call("send_message", "lead", {"troopId": tid, "recipientMemberIds": [own], "body": "Dinner?"}))
    # Another Scout: current training is still required.
    blocked = call("send_message", "lead", {"troopId": tid, "recipientMemberIds": [other], "body": "Hi"})
    assert blocked.status_code == 403 and "Youth Protection" in blocked.text
    both = call("send_message", "lead", {"troopId": tid, "recipientMemberIds": [own, other], "body": "Hi"})
    assert both.status_code == 403
