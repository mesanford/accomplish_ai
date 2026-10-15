"""End-to-end: the Scoutmaster role, and merit badge records that only the Scoutmaster and advancement chair change."""

import os
from datetime import UTC, datetime, timedelta

import pytest

from tests.integration.test_functions import call, owner
from tests.integration.test_membership_flow import new_scout, new_troop, ok
from tests.rules.emulator import list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
YPT = "2027-12-31"
FUTURE = datetime.now(UTC) + timedelta(days=365)


@pytest.fixture(autouse=True)
def clean():
    reset()
    yield


def join(tid: str, uid: str, role: str) -> str:
    """Invite a trained adult in `role` and return their member id."""
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": role}))
    form = {"troopId": tid, "code": invite["code"], "displayName": uid.title(), "yptExpiresAt": YPT}
    return ok(call("accept_invite", uid, form))["memberId"]


def days_ago(n: int) -> str:
    return (datetime.now(UTC) - timedelta(days=n)).date().isoformat()


def paper(tid: str, sid: str) -> dict:
    return {
        "troopId": tid,
        "scoutId": sid,
        "awardId": "camping",
        "counselorName": "Jordan Smith",
        "startedOn": days_ago(90),
        "requirements": [{"reqId": "1", "date": days_ago(60)}],
    }


def test_the_person_who_creates_a_troop_is_its_scoutmaster_everywhere_the_app_reads_roles():
    tid = new_troop("31")
    access = read(f"troops/{tid}/access/lead")
    assert access["roles"] == ["leader", "scoutmaster"]
    assert read(f"troops/{tid}/members/{access['memberId']}")["roles"] == ["leader", "scoutmaster"]
    assert read("users/lead")["troops"][tid]["roles"] == ["leader", "scoutmaster"]


def test_a_troop_can_invite_another_scoutmaster_who_needs_training():
    tid = new_troop("32")
    invite = ok(call("create_invite", "lead", {"troopId": tid, "role": "scoutmaster"}))
    no_date = call("accept_invite", "sm2", {"troopId": tid, "code": invite["code"], "displayName": "Sam"})
    assert no_date.status_code == 400 and "Youth Protection" in no_date.text
    join(tid, "sm3", "scoutmaster")
    assert read(f"troops/{tid}/access/sm3")["roles"] == ["scoutmaster"]
    assert call("create_invite", "sm3", {"troopId": tid, "role": "advancement"}).status_code == 200  # a leader's power


def test_paper_cards_and_earlier_badges_are_for_the_scoutmaster_and_advancement_chair():
    tid = new_troop("33")
    sid = new_scout(tid, "lead", "Sam", 2012)
    join(tid, "asst", "leader")
    join(tid, "chair", "advancement")

    refused = call("record_paper_blue_card", "asst", paper(tid, sid))
    assert refused.status_code == 403 and "Scoutmaster or advancement chair" in refused.text
    assert list_docs(f"troops/{tid}/signoffs") == []
    badges = {"troopId": tid, "scoutId": sid, "badges": [{"awardId": "camping", "date": "2024-07-15"}]}
    partial = {
        "troopId": tid,
        "scoutId": sid,
        "partials": [{"awardId": "cooking", "date": "2025-06-01", "requirements": ["1"]}],
    }
    for form in (badges, partial):
        denied = call("record_prior_advancement", "asst", form)
        assert denied.status_code == 403 and "Scoutmaster or advancement chair" in denied.text
    assert read(f"troops/{tid}/progress/{sid}_camping") is None

    # An assistant leader still records ranks, as before.
    ranks = {"troopId": tid, "scoutId": sid, "ranks": {"tenderfoot": "2023-02-01"}}
    assert ok(call("record_prior_advancement", "asst", ranks)) == {"ranks": 1, "badges": 0, "skipped": []}

    assert ok(call("record_prior_advancement", "chair", badges))["badges"] == 1
    assert ok(call("record_paper_blue_card", "lead", paper(tid, sid) | {"awardId": "chess"}))["requirements"] == 1
    assert ok(call("record_paper_blue_card", "chair", paper(tid, sid) | {"awardId": "art"}))["requirements"] == 1


def test_scoutmasters_are_given_and_taken_on_the_roster_but_the_troop_keeps_one():
    tid = new_troop("34")
    lead_id = read(f"troops/{tid}/access/lead")["memberId"]
    asst_id = join(tid, "asst", "leader")

    def change(uid: str, member: str, roles: list[str], **extra):
        return call("set_member_roles", uid, {"troopId": tid, "memberId": member, "roles": roles, **extra})

    # The only Scoutmaster can't step down while no one else is a Scoutmaster or advancement chair.
    stuck = change("lead", lead_id, ["leader"])
    assert stuck.status_code == 400 and "Scoutmaster or an advancement chair" in stuck.text
    assert read(f"troops/{tid}/access/lead")["roles"] == ["leader", "scoutmaster"]

    # Any leader can give the role on the roster. It shows in the member, the access record and the user.
    ok(change("asst", asst_id, ["leader", "scoutmaster"]))
    assert read(f"troops/{tid}/access/asst")["roles"] == ["leader", "scoutmaster"]
    assert read("users/asst")["troops"][tid]["roles"] == ["leader", "scoutmaster"]
    assert read(f"troops/{tid}/members/{asst_id}")["roles"] == ["leader", "scoutmaster"]

    ok(change("lead", lead_id, ["leader"]))  # now someone else is the Scoutmaster
    last = change("asst", asst_id, ["leader"])
    assert last.status_code == 400 and "Scoutmaster or an advancement chair" in last.text

    # An advancement chair is enough for the troop to manage merit badges.
    chair_id = join(tid, "chair", "advancement")
    ok(change("asst", asst_id, ["leader"]))
    assert read(f"troops/{tid}/access/asst")["roles"] == ["leader"]
    assert change("chair", chair_id, ["leader"]).status_code == 400  # the chair is now the only one

    # A troop that never had either (an older troop before the migration) can still change roles.
    owner.set("troops/old", {"name": "Old", "unitNumber": "1"})
    owner.set(
        "troops/old/members/m1",
        {"kind": "adult", "uid": "boss", "displayName": "Boss", "roles": ["leader"], "yptExpiresAt": FUTURE},
    )
    owner.set(
        "troops/old/members/m2",
        {"kind": "adult", "uid": "helper", "displayName": "Helper", "roles": ["leader"], "yptExpiresAt": FUTURE},
    )
    for uid, mid in (("boss", "m1"), ("helper", "m2")):
        owner.set(
            f"troops/old/access/{uid}", {"memberId": mid, "roles": ["leader"], "scoutIds": [], "yptExpiresAt": FUTURE}
        )
    old = call("set_member_roles", "boss", {"troopId": "old", "memberId": "m2", "roles": ["committee"]})
    assert old.status_code == 200, old.text
