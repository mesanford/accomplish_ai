"""End-to-end: a leader corrects a Scout's birth month and year, without it ever getting around parent consent."""

import os
from datetime import UTC, date, datetime

import pytest

from tests.integration.test_functions import call, owner
from tests.integration.test_membership_flow import new_troop, ok
from tests.rules.emulator import read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
YEAR = date.today().year
OLDER, YOUNG = YEAR - 15, YEAR - 11
AGREED = {"uid": "mom", "memberId": "m-mom", "at": datetime.now(UTC), "version": "2026-10-18.1"}


@pytest.fixture(autouse=True)
def clean():
    reset()
    yield


def scout(tid: str, sid: str, *, consented: bool, held: bool = False, uid: str | None = None) -> None:
    member = {"kind": "scout", "displayName": sid.title(), "guardianIds": ["m-mom"]}
    if held:
        member["consentHold"] = True
    if uid:
        member["uid"] = uid
    owner.set(f"troops/{tid}/members/{sid}", member)
    owner.set(f"troops/{tid}/scoutRecords/{sid}", {"currentRankId": "scout"})  # added before birth dates were asked
    if consented:
        owner.set(f"troops/{tid}/consents/{sid}", {"parentConsents": [AGREED]})


def birth(tid: str, sid: str, year: int, month: int = 4, caller: str = "lead"):
    return call("set_scout_birth", caller, {"troopId": tid, "scoutId": sid, "birthYear": year, "birthMonth": month})


def test_a_leader_fills_in_a_missing_birth_date():
    tid = new_troop("601")
    scout(tid, "ava", consented=True)
    assert ok(birth(tid, "ava", YOUNG)) == {"held": False}  # under 13, but a parent already agreed
    record = read(f"troops/{tid}/scoutRecords/ava")
    assert (record["birthYear"], record["birthMonth"], record["currentRankId"]) == (YOUNG, 4, "scout")


def test_only_leaders_can_change_it_and_the_date_must_be_a_scout_age():
    tid = new_troop("602")
    scout(tid, "ava", consented=True)
    owner.set(f"troops/{tid}/access/mom", {"memberId": "m-mom", "roles": ["parent"], "scoutIds": ["ava"]})
    assert birth(tid, "ava", OLDER, caller="mom").status_code == 403
    assert birth(tid, "ava", OLDER, month=13).status_code == 400
    assert birth(tid, "ava", YEAR - 25).status_code == 400
    assert birth(tid, "nobody", OLDER).status_code == 404
    assert "birthYear" not in read(f"troops/{tid}/scoutRecords/ava")


def test_a_scout_waiting_for_consent_cant_be_made_older_to_lift_the_hold():
    tid = new_troop("603")
    scout(tid, "ben", consented=False, held=True)
    response = birth(tid, "ben", OLDER)
    assert response.status_code == 400 and "waiting for a parent" in response.text
    assert read(f"troops/{tid}/members/ben")["consentHold"] is True
    assert "birthYear" not in read(f"troops/{tid}/scoutRecords/ben")


def test_a_date_that_may_make_a_scout_under_13_puts_them_on_hold_without_parent_consent():
    tid = new_troop("604")
    scout(tid, "cal", consented=False)
    assert ok(birth(tid, "cal", OLDER)) == {"held": False}
    assert "consentHold" not in read(f"troops/{tid}/members/cal")
    assert ok(birth(tid, "cal", YOUNG)) == {"held": True}
    assert read(f"troops/{tid}/members/cal")["consentHold"] is True
    assert birth(tid, "cal", OLDER).status_code == 400  # and now it can't be changed back without a parent


def test_a_scout_with_their_own_login_cant_be_made_under_13():
    tid = new_troop("605")
    scout(tid, "dee", consented=True, uid="dee-login")
    response = birth(tid, "dee", YOUNG)
    assert response.status_code == 400 and "own login" in response.text
    assert ok(birth(tid, "dee", OLDER)) == {"held": False}
