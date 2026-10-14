import pytest

from .conftest import FUTURE, T
from .emulator import Client

OK, DENIED = 200, 403
LEAD = f"{T}/leads/l1"
DOC = {"name": "Jordan", "email": "j@example.com", "status": "new", "notes": "", "source": "website"}
ASM = {"memberId": "m-asm", "roles": ["advancement"], "scoutIds": [], "yptExpiresAt": FUTURE}


@pytest.fixture(autouse=True)
def lead():
    Client("owner").set(LEAD, DOC)
    Client("owner").set(f"{T}/access/asm", ASM)


def test_only_leaders_read_leads():
    for uid in ("leader", "asm"):
        assert Client(uid).get(LEAD) == OK
    for uid in ("parent", "scout1", "counselor", "stranger"):
        assert Client(uid).get(LEAD) == DENIED
    assert Client(None).get(LEAD) == DENIED


def test_leaders_change_only_status_and_notes():
    assert Client("leader").set(LEAD, {**DOC, "status": "contacted", "notes": "Called Tuesday"}) == OK
    assert Client("leader").set(LEAD, {**DOC, "status": "not_interested"}) == OK
    assert Client("leader").set(LEAD, {**DOC, "status": "archived"}) == DENIED
    assert Client("leader").set(LEAD, {**DOC, "notes": "x" * 2001}) == DENIED
    assert Client("leader").set(LEAD, {**DOC, "email": "other@example.com"}) == DENIED
    assert Client("leader").set(LEAD, {**DOC, "extra": "field"}) == DENIED


def test_nobody_else_updates_leads():
    for uid in ("parent", "scout1", "counselor", "stranger"):
        assert Client(uid).set(LEAD, {**DOC, "status": "joined"}) == DENIED


def test_no_client_creates_or_deletes_leads():
    for uid in ("leader", "parent", None):
        assert Client(uid).create(f"{T}/leads/l2", DOC) == DENIED
        assert Client(uid).delete(LEAD) == DENIED
