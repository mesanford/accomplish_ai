"""Retention dates are server-only: no client can backdate when a Scout left or when a troop was last used."""

from datetime import UTC, datetime

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
LONG_AGO = datetime(2020, 1, 1, tzinfo=UTC)
leader, parent = Client("leader"), Client("parent")


def test_leaders_still_edit_a_scouts_roster_entry():
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam B."}) == OK


def test_no_client_sets_or_changes_left_at():
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "leftAt": LONG_AGO}) == DENIED
    assert leader.create(f"{T}/members/s9", {"kind": "scout", "displayName": "New", "leftAt": LONG_AGO}) == DENIED
    assert parent.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "leftAt": LONG_AGO}) == DENIED


def test_no_client_clears_left_at_either():
    Client("owner").set(f"{T}/members/s2", {"kind": "scout", "displayName": "Riley", "leftAt": LONG_AGO})
    assert leader.set(f"{T}/members/s2", {"kind": "scout", "displayName": "Riley"}) == DENIED
    assert leader.set(f"{T}/members/s2", {"kind": "scout", "displayName": "Riley", "leftAt": LONG_AGO}) == OK


def test_no_client_writes_troop_activity_dates():
    for client in (leader, parent):
        assert client.set(T, {"unitNumber": "123", "lastActiveAt": datetime.now(UTC)}) == DENIED
        assert client.set(T, {"unitNumber": "123", "activityTrackedSince": datetime.now(UTC)}) == DENIED
