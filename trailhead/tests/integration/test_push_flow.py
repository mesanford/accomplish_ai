"""End-to-end: registering and removing a device, and a push being logged (PUSH_MODE=log, which the emulator always
uses) and written to `pushOutbox` when an announcement is posted."""

import os
import time
from datetime import UTC, datetime, timedelta

import pytest
import requests

from tests.integration.test_functions import call, owner
from tests.rules.emulator import PROJECT, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
AUTH = f"http://{os.environ.get('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')}"
T = "troops/tn"
FUTURE = datetime.now(UTC) + timedelta(days=365)
MOM_TOKEN, KID_TOKEN, QUIET_TOKEN = "m" * 60, "k" * 60, "q" * 60


def token_docs(uid: str) -> list[dict]:
    return list_docs(f"users/{uid}/devices")


def pushed_to(template: str) -> list[str]:
    return sorted(m["uid"] for m in list_docs("pushOutbox") if m["template"] == template)


@pytest.fixture(autouse=True)
def seeded():
    reset()
    requests.delete(f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts", timeout=10)
    users = [{"localId": u, "email": f"{u}@example.test"} for u in ("lead", "mom", "quiet", "scout1", "dad")]
    url = f"{AUTH}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:batchCreate"
    requests.post(url, json={"users": users}, headers={"Authorization": "Bearer owner"}, timeout=10).raise_for_status()
    owner.set(T, {"name": "Troop 9", "unitNumber": "9"})
    owner.set("users/quiet", {"emailAnnouncements": False})
    owner.set(
        f"{T}/members/s1", {"kind": "scout", "displayName": "Ava Jones", "uid": "scout1", "guardianIds": ["m-mom"]}
    )
    owner.set(f"{T}/access/scout1", {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]})
    access = {
        "lead": (["leader", "scoutmaster"], []),
        "mom": (["parent"], ["s1"]),
        "quiet": (["parent"], ["s1"]),
        "dad": (["parent"], ["s1"]),  # no device
    }
    for uid, (roles, kids) in access.items():
        member = {"kind": "adult", "displayName": f"{uid.title()} Person", "uid": uid, "roles": roles}
        record = {"memberId": f"m-{uid}", "roles": roles, "scoutIds": kids}
        if "scoutmaster" in roles:
            member["yptExpiresAt"] = record["yptExpiresAt"] = FUTURE
        owner.set(f"{T}/members/m-{uid}", member)
        owner.set(f"{T}/access/{uid}", record)
    yield


def register(uid: str, token: str):
    return call("register_push_device", uid, {"token": token})


def test_a_device_registers_once_and_can_be_removed():
    assert register("mom", MOM_TOKEN).status_code == 200
    assert register("mom", MOM_TOKEN).status_code == 200  # again: refreshes, no second record
    [doc] = token_docs("mom")
    assert doc["token"] == MOM_TOKEN
    assert call("remove_push_device", "mom", {"token": MOM_TOKEN}).status_code == 200
    assert token_docs("mom") == []


def test_a_bad_token_and_a_missing_login_are_refused():
    assert call("register_push_device", "mom", {"token": "short"}).status_code == 400
    assert call("register_push_device", "mom", {}).status_code == 400
    url = f"http://127.0.0.1:5001/{PROJECT}/us-central1/register_push_device"
    assert requests.post(url, json={"data": {"token": MOM_TOKEN}}, timeout=30).status_code in (401, 403)


def test_a_device_moves_to_the_next_person_who_signs_in_on_it():
    register("mom", MOM_TOKEN)
    register("quiet", MOM_TOKEN)
    assert token_docs("mom") == [] and len(token_docs("quiet")) == 1


def test_posting_an_announcement_logs_a_push_for_each_device_that_wants_it():
    register("mom", MOM_TOKEN)
    register("scout1", KID_TOKEN)
    register("quiet", QUIET_TOKEN)  # turned announcements off
    body = {"troopId": "tn", "title": "Campout", "body": "Bring $25.", "audience": {"type": "troop"}}
    assert call("post_announcement", "lead", body).status_code == 200
    time.sleep(1)
    assert pushed_to("announcement") == ["mom", "scout1"]
    for push in list_docs("pushOutbox"):
        assert push["path"] == "/t/tn/announcements"
        shown = f"{push['title']} {push['body']}"
        assert "Bring" not in shown and "$" not in shown and "Jones" not in shown


def test_the_poster_is_not_pushed_and_no_token_leaks_into_the_outbox():
    register("lead", "l" * 60)
    register("mom", MOM_TOKEN)
    body = {"troopId": "tn", "title": "Hi", "body": "Hello", "audience": {"type": "troop"}}
    assert call("post_announcement", "lead", body).status_code == 200
    assert pushed_to("announcement") == ["mom"]
    assert all(MOM_TOKEN not in str(m) for m in list_docs("pushOutbox"))


def test_a_device_with_no_registration_gets_nothing():
    body = {"troopId": "tn", "title": "Hi", "body": "Hello", "audience": {"type": "troop"}}
    assert call("post_announcement", "lead", body).status_code == 200
    assert list_docs("pushOutbox") == []


def test_deleting_an_account_removes_its_devices():
    register("dad", "d" * 60)
    owner.set("users/dad", {"emailNotifications": True})
    assert call("delete_account", "dad", {"confirm": True}).status_code == 200
    assert token_docs("dad") == [] and read("users/dad") is None
