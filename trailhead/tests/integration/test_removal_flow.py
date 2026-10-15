"""End-to-end: a leader removes a Scout and their data goes; anyone can delete their own account."""

import os

import pytest

from tests.integration.test_functions import call, owner
from tests.integration.test_membership_flow import new_scout, new_troop, ok
from tests.rules.emulator import Client, list_docs, read, reset
from tests.rules.storage import Storage, reset_storage

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)


@pytest.fixture(autouse=True)
def clean():
    reset()
    reset_storage()
    owner.set("awards/art", {"name": "Art", "currentVersionId": "v1"})
    yield


def join(tid: str, uid: str, role: str, name: str, **invite) -> str:
    code = ok(call("create_invite", "lead", {"troopId": tid, "role": role, **invite}))["code"]
    return ok(call("accept_invite", uid, {"troopId": tid, "code": code, "displayName": name}))["memberId"]


def seed_scout_data(tid: str, sid: str, uid: str | None):
    t = f"troops/{tid}"
    owner.set(f"{t}/progress/{sid}_art", {"scoutId": sid, "awardId": "art", "status": "in_progress"})
    owner.set(f"{t}/blueCards/{sid}_art", {"scoutId": sid, "awardId": "art", "status": "in_progress", "photoPaths": []})
    owner.set(f"{t}/signoffs/so-{sid}", {"scoutId": sid, "awardId": "art", "status": "accepted", "signerUid": "lead"})
    owner.set(f"{t}/logs/e1_{sid}", {"scoutId": sid, "eventId": "e1"})
    owner.set(f"{t}/paths/{sid}", {"scoutId": sid, "goalAwardId": "eagle", "items": []})
    owner.set(f"{t}/events/e1/attendance/{sid}", {"present": False})
    owner.set(f"{t}/events/e1/rsvps/{sid}", {"going": True})
    if uid:
        owner.set(f"{t}/usage/{uid}_2026-10-14", {"count": 1})
    assert Storage("owner").upload(f"cards/{tid}/{sid}/{sid}_art/card.png") == 200


def test_remove_scout_erases_their_data_and_leaves_everyone_else():
    tid = new_troop("31")
    gone = new_scout(tid, "lead", "Sam", 2012)
    kept = new_scout(tid, "lead", "Ava", 2012)
    scout_invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "scout", "scoutMemberId": gone}))
    ok(call("accept_invite", "sam", {"troopId": tid, "code": scout_invite["code"], "displayName": "Sam"}))
    mom = join(tid, "mom", "parent", "Jordan", scoutIds=[gone, kept])
    t = f"troops/{tid}"
    seed_scout_data(tid, gone, "sam")
    seed_scout_data(tid, kept, None)
    owner.set(
        f"{t}/exports/r1", {"rows": [{"scoutId": gone}, {"scoutId": kept}], "rowCount": 2, "enteredScoutIds": [gone]}
    )
    owner.set(f"{t}/threads/th1", {"memberIds": [gone, mom], "participantUids": ["sam", "mom"], "lastMessage": "Hi"})
    owner.set(
        f"{t}/site/draft",
        {
            "gallery": [
                {"path": f"sites/{tid}/draft/solo.png", "scoutIds": [gone], "noScoutsShown": False},
                {"path": f"sites/{tid}/draft/group.png", "scoutIds": [gone, kept], "noScoutsShown": False},
            ]
        },
    )
    assert Storage("owner").upload(f"sites/{tid}/draft/solo.png") == 200
    assert Storage("owner").upload(f"sites/{tid}/draft/group.png") == 200

    # Only a leader, and only with the confirmation flag.
    assert call("remove_scout", "mom", {"troopId": tid, "scoutId": gone, "confirm": True}).status_code == 403
    assert call("remove_scout", "stranger", {"troopId": tid, "scoutId": gone, "confirm": True}).status_code == 403
    assert call("remove_scout", "lead", {"troopId": tid, "scoutId": gone}).status_code == 400
    assert call("remove_scout", "lead", {"troopId": tid, "scoutId": "nobody", "confirm": True}).status_code == 404
    assert read(f"{t}/members/{gone}") is not None

    result = ok(call("remove_scout", "lead", {"troopId": tid, "scoutId": gone, "confirm": True}))
    assert result["removed"] is True and result["files"] >= 2

    for path in (
        f"members/{gone}",
        f"scoutRecords/{gone}",
        f"progress/{gone}_art",
        f"blueCards/{gone}_art",
        f"signoffs/so-{gone}",
        f"logs/e1_{gone}",
        f"paths/{gone}",
        f"events/e1/attendance/{gone}",
        f"events/e1/rsvps/{gone}",
        "access/sam",
        "usage/sam_2026-10-14",
        f"invites/{scout_invite['code']}",
    ):
        assert read(f"{t}/{path}") is None, path
    assert Storage("owner").download(f"cards/{tid}/{gone}/{gone}_art/card.png") == 404
    assert Storage("owner").download(f"sites/{tid}/draft/solo.png") == 404
    assert Storage("owner").download(f"sites/{tid}/draft/group.png") == 200
    assert [g["path"] for g in read(f"{t}/site/draft")["gallery"]] == [f"sites/{tid}/draft/group.png"]

    # The Scout's login no longer lists the troop; the parent keeps the other child.
    assert tid not in (read("users/sam") or {}).get("troops", {})
    assert read(f"{t}/access/mom")["scoutIds"] == [kept]
    thread = read(f"{t}/threads/th1")
    assert thread["memberIds"] == [mom] and thread["participantUids"] == ["mom"]
    report = read(f"{t}/exports/r1")
    assert report["rows"] == [{"scoutId": kept}] and report["enteredScoutIds"] == []

    # The other Scout is untouched.
    for path in (
        f"members/{kept}",
        f"scoutRecords/{kept}",
        f"progress/{kept}_art",
        f"blueCards/{kept}_art",
        f"signoffs/so-{kept}",
        f"paths/{kept}",
        f"events/e1/attendance/{kept}",
    ):
        assert read(f"{t}/{path}") is not None, path
    assert Storage("owner").download(f"cards/{tid}/{kept}/{kept}_art/card.png") == 200


def test_remove_scout_handles_more_than_500_documents():
    tid = new_troop("32")
    sid = new_scout(tid, "lead", "Kai", 2012)
    t = f"troops/{tid}"
    for n in range(620):
        owner.set(
            f"{t}/signoffs/bulk-{n}", {"scoutId": sid, "awardId": "art", "status": "accepted", "signerUid": "lead"}
        )
    ok(call("remove_scout", "lead", {"troopId": tid, "scoutId": sid, "confirm": True}))
    assert list_docs(f"{t}/signoffs") == []
    assert read(f"{t}/members/{sid}") is None


def test_delete_account_for_a_parent_keeps_the_scouts_records():
    tid = new_troop("33")
    sid = new_scout(tid, "lead", "Sam", 2012)
    mom = join(tid, "mom", "parent", "Jordan", scoutIds=[sid])
    t = f"troops/{tid}"
    owner.set(f"{t}/progress/{sid}_art", {"scoutId": sid, "awardId": "art", "status": "in_progress"})
    owner.set(f"{t}/events/e1/rsvps/{mom}", {"going": True})
    owner.set(f"{t}/usage/mom_2026-10-14", {"count": 1})

    assert call("delete_account", "mom", {}).status_code == 400  # needs confirmation
    assert call("delete_account", "mom", {"confirm": True}).status_code == 200

    assert read(f"{t}/access/mom") is None
    assert read(f"{t}/members/{mom}") is None
    assert read("users/mom") is None
    assert read(f"{t}/events/e1/rsvps/{mom}") is None
    assert read(f"{t}/usage/mom_2026-10-14") is None
    # The Scout and their records stay, but no longer list the deleted parent.
    assert read(f"{t}/members/{sid}")["guardianIds"] == []
    assert read(f"{t}/progress/{sid}_art") is not None
    assert read(f"{t}/scoutRecords/{sid}") is not None


def test_delete_account_refuses_the_last_leader_until_someone_else_leads():
    tid = new_troop("34")
    new_scout(tid, "lead", "Sam", 2012)
    refused = call("delete_account", "lead", {"confirm": True})
    assert refused.status_code == 400
    assert "only leader" in refused.text
    assert read(f"troops/{tid}/access/lead") is not None and read("users/lead") is not None

    code = ok(call("create_invite", "lead", {"troopId": tid, "role": "leader"}))["code"]
    ok(
        call(
            "accept_invite", "asm", {"troopId": tid, "code": code, "displayName": "Alex", "yptExpiresAt": "2099-01-01"}
        )
    )
    assert call("delete_account", "lead", {"confirm": True}).status_code == 200
    assert read(f"troops/{tid}/access/lead") is None and read("users/lead") is None
    assert read(f"troops/{tid}/access/asm") is not None


def test_delete_account_for_a_scout_unlinks_the_login_but_keeps_the_record():
    tid = new_troop("35")
    sid = new_scout(tid, "lead", "Sam", 2012)
    code = ok(call("create_invite", "lead", {"troopId": tid, "role": "scout", "scoutMemberId": sid}))["code"]
    ok(call("accept_invite", "sam", {"troopId": tid, "code": code, "displayName": "Sam"}))
    assert read(f"troops/{tid}/members/{sid}")["uid"] == "sam"
    assert call("delete_account", "sam", {"confirm": True}).status_code == 200
    member = read(f"troops/{tid}/members/{sid}")
    assert member is not None and "uid" not in member
    assert read(f"troops/{tid}/access/sam") is None and read("users/sam") is None
    assert Client("sam").get(f"troops/{tid}/members/{sid}") == 403
