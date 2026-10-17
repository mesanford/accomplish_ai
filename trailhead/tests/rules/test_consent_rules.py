from datetime import UTC, datetime

from .conftest import T
from .emulator import Client, read

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


def test_no_client_adds_a_newer_consent_entry_even_on_their_own_scouts_record():
    """A parent agrees to a newer notice only through the review_consent_notice function."""
    first = {"uid": "parent", "memberId": "m-parent", "at": datetime.now(UTC), "version": "2026-10-15"}
    Client("owner").set(f"{T}/consents/s1", {"parentConsents": [first]})
    newer = {"parentConsents": [first, {**first, "version": "2026-10-17.1"}]}
    for uid in ("parent", "leader", "scout1"):
        assert Client(uid).set(f"{T}/consents/s1", newer) == DENIED
    assert read(f"{T}/consents/s1")["parentConsents"][-1]["version"] == "2026-10-15"


def test_reminder_records_are_closed_to_every_client():
    Client("owner").set(f"{T}/consentReminders/parent", {"at": datetime.now(UTC)})
    for uid in ("leader", "parent", "scout1", "counselor", "stranger", None):
        client = Client(uid)
        assert client.get(f"{T}/consentReminders/parent") == DENIED
        assert client.set(f"{T}/consentReminders/parent", {"at": datetime.now(UTC)}) == DENIED
        assert client.delete(f"{T}/consentReminders/parent") == DENIED
