"""End-to-end: a second leader finds a troop already on Forthright, asks to join, and a leader answers. A troop that
only its creator is in can be deleted."""

import os

import pytest
import requests

from tests.integration.test_functions import call, owner
from tests.rules.emulator import PROJECT, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
AUTH = f"http://{os.environ.get('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')}"
YOU = {"displayName": "Robin Helper", "creatorRole": "committee_member", "yptExpiresAt": "2030-06-30"}


@pytest.fixture(autouse=True)
def clean():
    reset()
    requests.delete(f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts", timeout=10)
    users = [{"localId": u, "email": f"{u}@example.test"} for u in ("lead", "robin", "sam")]
    url = f"{AUTH}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:batchCreate"
    requests.post(url, json={"users": users}, headers={"Authorization": "Bearer owner"}, timeout=10).raise_for_status()
    yield


def ok(response) -> dict:
    assert response.status_code == 200, response.text
    return response.json()["result"]


def refused(response, words: str) -> None:
    assert response.status_code != 200 and words in response.text, response.text


def new_troop(uid: str, unit: str, council: str) -> str:
    form = {
        "name": f"Troop {unit}",
        "unitNumber": unit,
        "council": council,
        "displayName": "Pat",
        "yptExpiresAt": "2030-12-31",
    }
    return ok(call("create_troop", uid, form))["troopId"]


def test_a_second_leader_finds_the_troop_and_is_approved():
    tid = new_troop("lead", "1107", "Bay-Lakes Council")
    assert read(f"troops/{tid}")["unitKey"] == "1107"

    [found] = ok(call("find_troops", "robin", {"unitNumber": "1107F", "council": "Bay Lakes"}))["matches"]
    assert found == {
        "troopId": tid,
        "name": "Troop 1107",
        "unitNumber": "1107",
        "council": "Bay-Lakes Council",
        "district": "",
        "member": False,
        "requested": False,
    }
    assert ok(call("find_troops", "robin", {"unitNumber": "1107", "council": "Three Fires"}))["matches"] == []

    ok(call("request_to_join", "robin", {"troopId": tid, **YOU}))
    request = read(f"troops/{tid}/joinRequests/robin")
    assert request["displayName"] == "Robin Helper" and request["email"] == "robin@example.test"
    assert tid in read("users/robin")["joinRequests"]
    assert ok(call("find_troops", "robin", {"unitNumber": "1107", "council": "Bay Lakes"}))["matches"][0]["requested"]
    mail = [m for m in list_docs("emailOutbox") if m["template"] == "join_requested"]
    assert [m["to"] for m in mail] == ["lead@example.test"]

    refused(call("answer_join_request", "robin", {"troopId": tid, "uid": "robin", "approve": True}), "PERMISSION")
    member_id = ok(call("answer_join_request", "lead", {"troopId": tid, "uid": "robin", "approve": True}))["memberId"]
    assert read(f"troops/{tid}/access/robin")["roles"] == ["leader", "committee"]
    assert read(f"troops/{tid}/members/{member_id}")["displayName"] == "Robin Helper"
    assert read(f"troops/{tid}/joinRequests/robin") is None
    user = read("users/robin")
    assert tid in user["troops"] and tid not in (user.get("joinRequests") or {})
    assert any(m["template"] == "join_approved" and m["to"] == "robin@example.test" for m in list_docs("emailOutbox"))
    refused(call("request_to_join", "robin", {"troopId": tid, **YOU}), "already in this troop")


def test_a_leader_declines_and_the_person_can_cancel_their_own():
    tid = new_troop("lead", "45", "Michigan Crossroads")
    ok(call("request_to_join", "robin", {"troopId": tid, **YOU}))
    ok(call("answer_join_request", "lead", {"troopId": tid, "uid": "robin", "approve": False}))
    assert read(f"troops/{tid}/joinRequests/robin") is None
    assert read(f"troops/{tid}/access/robin") is None
    assert tid not in (read("users/robin").get("joinRequests") or {})
    assert any(m["template"] == "join_declined" for m in list_docs("emailOutbox"))

    ok(call("request_to_join", "sam", {"troopId": tid, **YOU, "displayName": "Sam"}))
    ok(call("cancel_join_request", "sam", {"troopId": tid}))
    assert read(f"troops/{tid}/joinRequests/sam") is None
    refused(call("request_to_join", "sam", {"troopId": tid, **YOU, "creatorRole": "king"}), "Pick your role")


def test_only_a_troop_nobody_else_is_in_can_be_deleted():
    tid = new_troop("lead", "88", "Pine")
    other = new_troop("sam", "88", "Pine")  # the copy
    ok(call("request_to_join", "robin", {"troopId": other, **YOU}))
    refused(call("delete_troop", "lead", {"troopId": other, "confirm": True}), "PERMISSION")
    refused(call("delete_troop", "sam", {"troopId": other}), "Confirm")
    ok(call("delete_troop", "sam", {"troopId": other, "confirm": True}))
    assert read(f"troops/{other}") is None and read(f"troops/{other}/access/sam") is None
    assert other not in (read("users/sam").get("troops") or {})
    assert other not in (read("users/robin").get("joinRequests") or {})

    owner.set(f"troops/{tid}/access/robin", {"memberId": "m-r", "roles": ["parent"], "scoutIds": []})
    refused(call("delete_troop", "lead", {"troopId": tid, "confirm": True}), "Other people")
    assert read(f"troops/{tid}") is not None
