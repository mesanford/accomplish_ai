from .conftest import T
from .emulator import Client
from .test_rules import DENIED, OK, counselor, leader, parent, scout1, signoff, stranger

AWARD = f"{T}/customAwards/custom-trail"
VERSION = f"{AWARD}/versions/v1"


def seed():
    owner = Client("owner")
    owner.set(AWARD, {"name": "First-Year Trail", "currentVersionId": "v1", "archived": False})
    owner.set(VERSION, {"requirements": [{"id": "r1", "label": "1", "text": "Attend three meetings."}]})


def test_members_read_custom_awards_and_versions():
    seed()
    for member in (leader, parent, scout1, counselor):
        assert member.get(AWARD) == OK
        assert member.get(VERSION) == OK
    assert stranger.get(AWARD) == DENIED
    assert stranger.get(VERSION) == DENIED


def test_custom_awards_are_server_written():
    seed()
    assert leader.set(AWARD, {"name": "Renamed"}) == DENIED
    assert leader.create(f"{T}/customAwards/custom-new", {"name": "New"}) == DENIED
    assert leader.set(VERSION, {"requirements": []}) == DENIED
    assert leader.create(f"{AWARD}/versions/v2", {"requirements": []}) == DENIED
    assert leader.delete(AWARD) == DENIED


def test_leaders_sign_custom_award_requirements_and_others_cannot():
    seed()
    custom = {**signoff("leader", award="custom-trail"), "reqId": "r1"}
    assert leader.create(f"{T}/signoffs/c1", custom) == OK
    assert counselor.create(f"{T}/signoffs/c2", {**custom, "signerUid": "counselor"}) == DENIED
    assert parent.create(f"{T}/signoffs/c3", {**custom, "signerUid": "parent"}) == DENIED
    assert scout1.create(f"{T}/signoffs/c4", {**custom, "signerUid": "scout1"}) == DENIED
