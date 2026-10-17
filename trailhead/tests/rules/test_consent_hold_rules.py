"""A Scout waiting for a parent's first consent (`consentHold` on the member) gets no new data from any client."""

from datetime import UTC, datetime

import pytest

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
NOW = datetime.now(UTC)
EVENT = f"{T}/events/e1"
leader, chair, parent = Client("leader"), Client("chair"), Client("parent")
owner = Client("owner")


@pytest.fixture(autouse=True)
def waiting_scout():
    """s2 is waiting for a parent; s1 (the other Scout) is not."""
    owner.set(f"{T}/members/s2", {"kind": "scout", "displayName": "Riley", "consentHold": True})
    owner.set(f"{T}/scoutRecords/s2", {"birthYear": 2016, "birthMonth": 3, "currentRankId": "scout"})
    owner.set(EVENT, {"title": "Campout", "start": NOW})
    yield


def signoff(scout: str) -> dict:
    return {
        "scoutId": scout,
        "awardId": "camping",
        "versionId": "v1",
        "reqId": "1",
        "signerUid": "leader",
        "signedAt": NOW,
        "status": "pending",
    }


def test_no_sign_off_for_a_waiting_scout_but_other_scouts_are_unaffected():
    assert leader.create(f"{T}/signoffs/a", signoff("s2")) == DENIED
    assert leader.create(f"{T}/signoffs/b", signoff("s1")) == OK


def test_no_plan_for_a_waiting_scout():
    path = {"scoutId": "s2", "goalAwardId": "star", "items": []}
    assert leader.create(f"{T}/paths/s2", path) == DENIED
    assert leader.set(f"{T}/paths/s2", path) == DENIED


def test_no_blue_card_for_a_waiting_scout():
    card = {"scoutId": "s2", "awardId": "art", "versionId": "v1", "status": "requested", "requestedAt": NOW}
    assert chair.create(f"{T}/blueCards/s2_art", card) == DENIED
    assert leader.create(f"{T}/blueCards/s2_art", card) == DENIED
    owner.set(f"{T}/members/s2", {"kind": "scout", "displayName": "Riley"})  # a parent agrees: the hold is lifted
    assert chair.create(f"{T}/blueCards/s2_art", card) == OK


def test_no_attendance_or_rsvp_for_a_waiting_scout():
    assert leader.set(f"{EVENT}/attendance/s2", {"present": True}) == DENIED
    assert leader.set(f"{EVENT}/attendance/s1", {"present": True}) == OK
    assert leader.set(f"{EVENT}/rsvps/s2", {"going": True}) == DENIED


def test_no_private_details_for_a_waiting_scout():
    assert (
        leader.set(f"{T}/scoutRecords/s2", {"birthYear": 2016, "birthMonth": 3, "currentRankId": "tenderfoot"})
        == DENIED
    )
    assert leader.set(f"{T}/scoutRecords/s1", {"birthYear": 2012, "birthMonth": 3, "currentRankId": "scout"}) == OK


def test_no_client_adds_removes_or_creates_a_hold_or_a_scout():
    waiting = {"kind": "scout", "displayName": "Riley", "consentHold": True}
    assert leader.set(f"{T}/members/s2", {"kind": "scout", "displayName": "Riley"}) == DENIED  # lifting it
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "consentHold": True}) == DENIED
    assert leader.set(f"{T}/members/s2", {**waiting, "displayName": "Riley R"}) == OK  # other edits still work
    assert (
        leader.create(f"{T}/members/s9", {"kind": "scout", "displayName": "New"}) == DENIED
    )  # only add_scout does that
    assert leader.create(f"{T}/members/a9", {"kind": "adult", "displayName": "Adult"}) == OK


def test_parents_entered_for_a_waiting_scout_are_leader_read_and_server_written():
    request = {"parents": [{"pid": "p1", "name": "Pat", "email": "pat@example.test", "status": "emailed"}]}
    owner.set(f"{T}/consentRequests/s2", request)
    assert leader.get(f"{T}/consentRequests/s2") == OK
    for uid in ("parent", "scout1", "counselor", "stranger", None):
        assert Client(uid).get(f"{T}/consentRequests/s2") == DENIED
    for uid in ("leader", "chair", "parent", None):
        client = Client(uid)
        assert client.set(f"{T}/consentRequests/s2", request) == DENIED
        assert client.delete(f"{T}/consentRequests/s2") == DENIED
