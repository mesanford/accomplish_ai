"""Deleting a Scout's data or an account is server-only: no signed-in client can delete these documents."""

import pytest

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403

owner = Client("owner")
leader, parent, scout1 = Client("leader"), Client("parent"), Client("scout1")


@pytest.fixture(autouse=True)
def scout_data(troop):
    owner.set(f"{T}/scoutRecords/s1", {"birthYear": 2012, "birthMonth": 3, "currentRankId": "scout", "rankDates": {}})
    owner.set(f"{T}/logs/e1_s1", {"scoutId": "s1", "eventId": "e1"})
    owner.set(f"{T}/exports/r1", {"rows": [], "enteredScoutIds": []})
    owner.set(f"{T}/usage/leader_2026-10-14", {"count": 1})
    owner.set("users/leader", {"troops": {}})
    yield


def test_leaders_still_write_scout_records_but_cannot_delete_them():
    assert leader.set(f"{T}/scoutRecords/s1", {"birthYear": 2012, "birthMonth": 3, "currentRankId": "star"}) == OK
    assert leader.delete(f"{T}/scoutRecords/s1") == DENIED
    assert parent.delete(f"{T}/scoutRecords/s1") == DENIED


@pytest.mark.parametrize(
    "path",
    [
        "members/s1",
        "scoutRecords/s1",
        "progress/s1_camping",
        "blueCards/s1_chess",
        "logs/e1_s1",
        "access/scout1",
        "access/parent",
        "threads/th1",
        "exports/r1",
        "usage/leader_2026-10-14",
    ],
)
def test_no_client_deletes_a_scouts_or_a_members_documents(path):
    for client in (leader, parent, scout1):
        assert client.delete(f"{T}/{path}") == DENIED


def test_nobody_deletes_a_user_document_from_the_client():
    assert Client("leader").delete("users/leader") == DENIED
