import pytest

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
REQUEST = f"{T}/joinRequests/stranger"
DOC = {"uid": "stranger", "displayName": "Robin", "email": "r@example.com", "creatorRole": "leader"}


@pytest.fixture(autouse=True)
def request_doc():
    Client("owner").set(REQUEST, DOC)


def test_only_leaders_read_join_requests():
    assert Client("leader").get(REQUEST) == OK
    for uid in ("parent", "scout1", "counselor", "stranger", None):
        assert Client(uid).get(REQUEST) == DENIED  # not even the person who asked: their copy is on users/{uid}


def test_only_the_server_writes_join_requests():
    for uid in ("leader", "parent", "stranger", None):
        assert Client(uid).set(REQUEST, {**DOC, "creatorRole": "scoutmaster"}) == DENIED
        assert Client(uid).create(f"{T}/joinRequests/{uid or 'anon'}", DOC) == DENIED
        assert Client(uid).delete(REQUEST) == DENIED
