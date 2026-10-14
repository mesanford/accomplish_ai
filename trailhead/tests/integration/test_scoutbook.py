"""The Scoutbook handoff callables on the emulator."""

import os
from datetime import UTC, datetime, timedelta

import pytest

from tests.integration.test_functions import FUTURE, T, call, owner
from tests.rules.emulator import read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)


@pytest.fixture(autouse=True)
def seeded():
    reset()
    owner.set(T, {"unitNumber": "123"})
    owner.set(f"{T}/members/m-leader", {"kind": "adult", "uid": "leader", "displayName": "Pat"})
    owner.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam"})
    owner.set(
        f"{T}/access/leader", {"memberId": "m-leader", "roles": ["leader"], "scoutIds": [], "yptExpiresAt": FUTURE}
    )
    owner.set(f"{T}/access/parent", {"memberId": "m-parent", "roles": ["parent"], "scoutIds": ["s1"]})
    owner.set(f"{T}/scoutRecords/s1", {"rankDates": {"first-class": "2026-09-01"}})
    signed = datetime.now(UTC) - timedelta(days=1)
    base = {"scoutId": "s1", "versionId": "v1", "signerUid": "leader", "signedAt": signed}
    owner.set(f"{T}/signoffs/a", {**base, "awardId": "camping", "reqId": "1", "status": "accepted"})
    owner.set(f"{T}/signoffs/b", {**base, "awardId": "camping", "reqId": "2", "status": "pending"})
    owner.set(f"{T}/signoffs/c", {**base, "awardId": "custom-hike", "reqId": "1", "status": "accepted"})
    yield


def test_leader_creates_a_report_and_ticks_off_a_scout():
    made = call("create_scoutbook_report", "leader", {"troopId": "t1"})
    assert made.status_code == 200, made.text
    result = made.json()["result"]
    assert result["created"] is True
    assert result["rowCount"] >= 2  # accepted camping requirements (the sign-off trigger may accept more) + rank
    report = read(f"{T}/exports/{result['reportId']}")
    assert {r["kind"] for r in report["rows"]} == {"rank", "requirement"}
    assert not any(r["awardId"].startswith("custom-") for r in report["rows"])
    assert report["rows"][0]["scoutName"] == "Sam"
    assert report["enteredScoutIds"] == []
    assert read(T)["lastScoutbookExportAt"] is not None

    entered = {"troopId": "t1", "reportId": result["reportId"], "scoutId": "s1", "entered": True}
    assert call("set_scoutbook_entered", "leader", entered).status_code == 200
    assert read(f"{T}/exports/{result['reportId']}")["enteredScoutIds"] == ["s1"]
    assert call("set_scoutbook_entered", "leader", {**entered, "entered": False}).status_code == 200
    assert read(f"{T}/exports/{result['reportId']}")["enteredScoutIds"] == []
    assert call("set_scoutbook_entered", "leader", {**entered, "scoutId": "nobody"}).status_code == 400
    assert call("set_scoutbook_entered", "parent", entered).status_code == 403


def test_second_report_with_nothing_new_is_not_stored():
    assert call("create_scoutbook_report", "leader", {"troopId": "t1"}).json()["result"]["created"] is True
    again = call("create_scoutbook_report", "leader", {"troopId": "t1"}).json()["result"]
    assert again["created"] is False
    assert "Nothing new" in again["message"]


def test_parents_cannot_create_reports():
    assert call("create_scoutbook_report", "parent", {"troopId": "t1"}).status_code == 403
    assert call("create_scoutbook_report", "stranger", {"troopId": "t1"}).status_code == 403
