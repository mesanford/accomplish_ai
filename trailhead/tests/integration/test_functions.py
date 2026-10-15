"""End-to-end: real Cloud Functions running on the emulator, triggered through Firestore and HTTPS."""

import os
import time
from datetime import UTC, datetime, timedelta

import pytest
import requests

from tests.rules.emulator import PROJECT, Client, list_docs, read, reset, token

FUNCTIONS = os.environ.get("FUNCTIONS_EMULATOR_URL", "http://127.0.0.1:5001")
T = "troops/t1"
FUTURE = datetime.now(UTC) + timedelta(days=365)

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
owner = Client("owner")


def wait_for(fn, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        value = fn()
        if value:
            return value
        time.sleep(0.5)
    raise AssertionError("timed out waiting for a function to run")


def call(name: str, uid: str, data: dict) -> requests.Response:
    url = f"{FUNCTIONS}/{PROJECT}/us-central1/{name}"
    return requests.post(url, json={"data": data}, headers={"Authorization": f"Bearer {token(uid)}"}, timeout=30)


@pytest.fixture(autouse=True)
def seeded():
    reset()
    owner.set(T, {"unitNumber": "123", "yptCopyMemberIds": ["m-asm"]})
    owner.set("awards/camping", {"name": "Camping", "currentVersionId": "v1"})
    members = {
        "m-leader": {"kind": "adult", "uid": "leader", "yptExpiresAt": FUTURE},
        "m-asm": {"kind": "adult", "uid": "asm", "yptExpiresAt": FUTURE},
        "m-parent": {"kind": "adult", "uid": "parent"},
        "s1": {"kind": "scout", "uid": "scout1", "guardianIds": ["m-parent"]},
        "s2": {"kind": "scout"},  # under 13, no parent on the app yet
    }
    for mid, m in members.items():
        owner.set(f"{T}/members/{mid}", m)
    leader_access = {"memberId": "m-leader", "roles": ["leader"], "scoutIds": [], "yptExpiresAt": FUTURE}
    owner.set(f"{T}/access/leader", leader_access)
    owner.set(f"{T}/access/scout1", {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]})
    record = {"birthYear": 2012, "birthMonth": 5, "currentRankId": "first-class"}
    owner.set(f"{T}/scoutRecords/s1", {**record, "rankDates": {"first-class": "2026-09-01"}})
    yield


def test_signoff_updates_progress():
    so = {
        "scoutId": "s1",
        "awardId": "camping",
        "versionId": "v1",
        "reqId": "1",
        "signerUid": "leader",
        "status": "pending",
    }
    owner.create(f"{T}/signoffs/a", so)
    done = wait_for(lambda: (read(f"{T}/signoffs/a") or {}).get("status") != "pending" and read(f"{T}/signoffs/a"))
    assert done["status"] == "accepted"
    assert read(f"{T}/progress/s1_camping")["requirements"]["1"]["status"] == "signed"

    owner.create(f"{T}/signoffs/b", {**so, "versionId": "v2", "reqId": "2"})
    rejected = wait_for(lambda: (read(f"{T}/signoffs/b") or {}).get("status") == "rejected" and read(f"{T}/signoffs/b"))
    assert "version v1" in rejected["rejectedReason"]


def test_path_gets_feasibility():
    item = {"awardId": "chess", "plannedStart": "2026-11-01", "plannedEnd": "2026-12-01"}
    owner.set(f"{T}/paths/s1", {"scoutId": "s1", "goalAwardId": "eagle", "targetDate": "2027-06-01", "items": [item]})
    path = wait_for(lambda: (read(f"{T}/paths/s1") or {}).get("feasibility") and read(f"{T}/paths/s1"))
    assert path["feasibility"]["status"] == "infeasible"
    assert any(i["code"] == "not_enough_badges" for i in path["feasibility"]["issues"])


def test_attendance_logs_and_marks_ready():
    event = {
        "start": "2026-10-10",
        "logValues": {"nights": 2},
        "linkedRequirements": [{"awardId": "camping", "reqId": "9a"}],
    }
    owner.set(f"{T}/events/e1", event)
    owner.set(f"{T}/events/e1/attendance/s1", {"present": True})
    log = wait_for(lambda: read(f"{T}/logs/e1_s1"))
    assert log["nights"] == 2
    progress = wait_for(lambda: read(f"{T}/progress/s1_camping"))
    assert progress["requirements"]["9a"]["status"] == "ready"


def test_message_to_scout_copies_parent():
    r = call("send_message", "leader", {"troopId": "t1", "recipientMemberIds": ["s1"], "body": "Campout Friday"})
    assert r.status_code == 200, r.text
    result = r.json()["result"]
    assert result["addedMemberIds"] == ["m-parent"]
    threads = list_docs(f"{T}/threads")
    assert set(threads[0]["participantUids"]) == {"leader", "scout1", "parent"}


def test_message_of_only_spaces_is_refused_and_text_is_trimmed():
    blank = call("send_message", "leader", {"troopId": "t1", "recipientMemberIds": ["s1"], "body": "   \n  "})
    assert blank.status_code == 400
    assert "Write a message first" in blank.text
    assert list_docs(f"{T}/threads") == []
    ok = call("send_message", "leader", {"troopId": "t1", "recipientMemberIds": ["s1"], "body": "  Hello  "})
    assert ok.status_code == 200, ok.text
    thread_id = ok.json()["result"]["threadId"]
    assert [m["body"] for m in list_docs(f"{T}/threads/{thread_id}/messages")] == ["Hello"]


def test_message_to_scout_without_parent_copies_second_adult():
    r = call("send_message", "leader", {"troopId": "t1", "recipientMemberIds": ["s2"], "body": "Welcome"})
    assert r.status_code == 200, r.text
    assert r.json()["result"]["addedMemberIds"] == ["m-asm"]


def test_scout_cannot_message_another_scout():
    r = call("send_message", "scout1", {"troopId": "t1", "recipientMemberIds": ["s2"], "body": "Hey"})
    assert r.status_code == 403
    assert "not other Scouts" in r.text
    assert list_docs(f"{T}/threads") == []


def test_scout_cannot_add_a_scout_to_a_new_conversation():
    r = call("send_message", "scout1", {"troopId": "t1", "recipientMemberIds": ["m-leader", "s2"], "body": "Hey"})
    assert r.status_code == 403


def test_scout_can_message_a_leader_and_parent_is_copied():
    r = call("send_message", "scout1", {"troopId": "t1", "recipientMemberIds": ["m-leader"], "body": "Question"})
    assert r.status_code == 200, r.text
    assert "m-parent" in r.json()["result"]["recipientMemberIds"]


def test_existing_youth_only_thread_is_read_only():
    owner.set(f"{T}/threads/old", {"memberIds": ["s1", "s2"], "participantUids": ["scout1"], "lastMessage": "hi"})
    r = call("send_message", "scout1", {"troopId": "t1", "threadId": "old", "body": "Anyone?"})
    assert r.status_code == 403
    assert "needs an adult" in r.text


def test_scout_cannot_preview_another_scouts_path():
    r = call("check_path_preview", "scout1", {"troopId": "t1", "path": {"scoutId": "s2", "goalAwardId": "star"}})
    assert r.status_code == 403
