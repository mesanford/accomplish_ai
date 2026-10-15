from datetime import UTC, datetime

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
CONSENT = {"parentConsents": [{"uid": "parent", "memberId": "m-parent", "at": datetime.now(UTC), "version": "v"}]}


def test_leaders_and_the_scouts_family_read_consent():
    Client("owner").set(f"{T}/consents/s1", CONSENT)
    for uid in ("leader", "parent", "scout1"):
        assert Client(uid).get(f"{T}/consents/s1") == OK


def test_other_people_cannot_read_consent():
    Client("owner").set(f"{T}/consents/s2", CONSENT)
    for uid in ("parent", "counselor", "stranger", None):
        assert Client(uid).get(f"{T}/consents/s2") == DENIED


def test_no_client_writes_consent():
    for uid in ("leader", "parent", "scout1", "counselor", "stranger", None):
        client = Client(uid)
        assert client.set(f"{T}/consents/s1", CONSENT) == DENIED
        assert client.create(f"{T}/consents/s3", CONSENT) == DENIED
        assert client.delete(f"{T}/consents/s1") == DENIED
