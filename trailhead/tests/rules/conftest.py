import os
from datetime import UTC, datetime, timedelta

import pytest
import requests

from .emulator import Client, reset

T = "troops/t1"
FUTURE = datetime.now(UTC) + timedelta(days=365)
PAST = datetime.now(UTC) - timedelta(days=30)


def _emulator_up() -> bool:
    host = os.environ.get("FIRESTORE_EMULATOR_HOST")
    if not host:
        return False
    try:
        requests.get(f"http://{host}/", timeout=2)
        return True
    except requests.RequestException:
        return False


def pytest_collection_modifyitems(items):
    if _emulator_up():
        return
    skip = pytest.mark.skip(reason="Firestore emulator not running; use `firebase emulators:exec`")
    for item in items:
        if "rules" in str(item.fspath):
            item.add_marker(skip)


@pytest.fixture(autouse=True)
def troop():
    """A troop with a leader, an expired leader, a counselor, a parent and two Scouts."""
    if not _emulator_up():
        yield
        return
    reset()
    owner = Client("owner")
    owner.set(T, {"unitNumber": "123", "yptCopyMemberIds": ["m-leader"]})
    access = {
        "leader": {"memberId": "m-leader", "roles": ["leader"], "scoutIds": [], "yptExpiresAt": FUTURE},
        "lapsed": {"memberId": "m-lapsed", "roles": ["leader"], "scoutIds": [], "yptExpiresAt": PAST},
        "counselor": {"memberId": "m-mbc", "roles": ["counselor"], "scoutIds": [], "yptExpiresAt": FUTURE},
        "parent": {"memberId": "m-parent", "roles": ["parent"], "scoutIds": ["s1"], "yptExpiresAt": PAST},
        "scout1": {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"], "yptExpiresAt": PAST},
    }
    for uid, doc in access.items():
        owner.set(f"{T}/access/{uid}", doc)
    owner.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam"})
    owner.set(f"{T}/members/s2", {"kind": "scout", "displayName": "Riley"})
    owner.set(f"{T}/progress/s1_camping", {"scoutId": "s1", "awardId": "camping", "status": "in_progress"})
    owner.set(
        f"{T}/blueCards/s1_chess",
        {"scoutId": "s1", "awardId": "chess", "versionId": "v1", "status": "in_progress", "counselorUid": "counselor"},
    )
    owner.set(f"{T}/threads/th1", {"participantUids": ["leader", "parent"]})
    yield
