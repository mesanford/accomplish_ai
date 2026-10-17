"""Push tokens: no client reads or writes a device record, not even the person it belongs to."""

import pytest

from .emulator import Client

OK, DENIED = 200, 403
DEVICE = "users/mom/devices/d1"
owner, mom, leader, stranger, anyone = (
    Client("owner"),
    Client("mom"),
    Client("leader"),
    Client("stranger"),
    Client(None),
)


@pytest.fixture(autouse=True)
def registered(troop):
    owner.set("users/mom", {"emailNotifications": True})
    owner.set(DEVICE, {"token": "t" * 40})


def test_nobody_reads_a_device_record():
    for client in (mom, leader, stranger, anyone):
        assert client.get(DEVICE) == DENIED


def test_nobody_writes_or_deletes_a_device_record():
    for client in (mom, leader, stranger, anyone):
        assert client.set(DEVICE, {"token": "x" * 40}) == DENIED
        assert client.set("users/mom/devices/d2", {"token": "x" * 40}) == DENIED
        assert client.delete(DEVICE) == DENIED
    assert owner.get(DEVICE) == OK  # still there, untouched


def test_the_person_still_reads_their_own_user_document():
    assert mom.get("users/mom") == OK and stranger.get("users/mom") == DENIED
