"""End-to-end: Youth Protection reminders, health form dates, and erasing them with the person.

The scheduled function can't be triggered on these emulators, so the job's body (`run_ypt_reminders`) runs in this
process against the same Firestore emulator the functions use, like the retention tests. Email is logged to
`emailOutbox` (the emulator mode); addresses are faked so no Auth emulator is needed for the job.
"""

import os
from datetime import UTC, datetime, timedelta

import pytest

from tests.integration.test_functions import call, owner
from tests.rules.emulator import Client, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
TID = "tn"
T = f"troops/{TID}"
NOW = datetime(2026, 10, 14, 12, tzinfo=UTC)  # a Wednesday; 07:00 in US Central


def ypt(days_from_today: int) -> datetime:
    """An expiry date the way the app stores it: the entered day at 23:59 UTC."""
    day = (NOW + timedelta(days=days_from_today)).date()
    return datetime(day.year, day.month, day.day, 23, 59, tzinfo=UTC)


ADULTS = {
    # uid: (roles, days until training expires)
    "lead": (["leader", "scoutmaster"], 400),
    "thirty": (["leader"], 30),
    "seven": (["counselor"], 7),
    "lapsed": (["counselor"], -1),  # the last good day was yesterday: lapses today
    "ancient": (["committee"], -400),  # lapsed long ago: in the weekly list, not emailed
    "fine": (["committee"], 200),
    "quiet": (["leader"], 30),  # turned notifications off
    "mom": (["parent"], None),  # parents need no training
}


@pytest.fixture(autouse=True)
def seeded():
    reset()
    owner.set(T, {"name": "Troop 9", "unitNumber": "9"})
    owner.set("users/quiet", {"emailNotifications": False})
    for uid, (roles, days) in ADULTS.items():
        member = {"kind": "adult", "displayName": f"{uid.title()} Person", "uid": uid, "roles": roles}
        access = {"memberId": f"m-{uid}", "roles": roles, "scoutIds": ["s1"] if "parent" in roles else []}
        if days is not None:
            member["yptExpiresAt"] = access["yptExpiresAt"] = ypt(days)
        owner.set(f"{T}/members/m-{uid}", member)
        owner.set(f"{T}/access/{uid}", access)
    # A Scout with a login, whose record even carries a stale training date: never emailed.
    owner.set(
        f"{T}/members/s1", {"kind": "scout", "displayName": "Ava Jones", "uid": "scout1", "guardianIds": ["m-mom"]}
    )
    owner.set(f"{T}/members/s2", {"kind": "scout", "displayName": "Sam Smith"})
    owner.set(f"{T}/access/scout1", {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"], "yptExpiresAt": ypt(-5)})
    yield


@pytest.fixture
def run(monkeypatch):
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    monkeypatch.setattr("endpoints.notify.address_of", lambda uid: f"{uid}@example.test")
    from endpoints.ypt_reminders import run_ypt_reminders

    return lambda now=NOW: run_ypt_reminders(now)


def sent(template: str) -> list[str]:
    return sorted(m["to"].split("@")[0] for m in list_docs("emailOutbox") if m["template"] == template)


def test_each_reminder_goes_to_the_right_adult_once(run):
    totals = run()
    assert totals == {"reminders": 4, "weekly": 1}  # thirty, quiet (opted out of email), seven and lapsed
    assert sent("ypt_30") == ["thirty"]
    assert sent("ypt_7") == ["seven"]
    assert sent("ypt_lapsed") == ["lapsed"]


def test_running_the_job_again_sends_nothing_more(run):
    run()
    first = len(list_docs("emailOutbox"))
    assert run() == {"reminders": 0, "weekly": 0}
    assert run(NOW + timedelta(hours=3)) == {"reminders": 0, "weekly": 0}
    assert len(list_docs("emailOutbox")) == first
    assert sent("ypt_30") == ["thirty"]  # not quiet (opted out), fine, ancient or the parent


def test_a_rerun_the_next_day_sends_no_second_reminder_for_the_same_stage(run):
    run()
    before = len(list_docs("emailOutbox"))
    run(NOW + timedelta(days=1))
    assert len(list_docs("emailOutbox")) == before
    record = read(f"{T}/yptReminders/m-seven")
    assert record["sent"] == ["30", "7"] and record["expiresOn"] == (NOW + timedelta(days=7)).date().isoformat()


def test_the_next_stage_goes_out_on_its_day(run):
    run()
    run(NOW + timedelta(days=23))  # "thirty" is now 7 days from expiring
    assert sent("ypt_7") == ["seven", "thirty"]
    run(NOW + timedelta(days=31))  # and now it has lapsed
    assert sent("ypt_lapsed") == ["lapsed", "thirty"]


def test_scouts_and_parents_are_never_emailed(run):
    run()
    run(NOW + timedelta(days=40))
    recipients = {m["to"].split("@")[0] for m in list_docs("emailOutbox")}
    assert not recipients & {"scout1", "mom"}
    assert read(f"{T}/yptReminders/s1") is None and read(f"{T}/yptReminders/m-mom") is None


def test_the_scoutmaster_gets_a_weekly_list_once_a_week(run):
    run()
    run(NOW + timedelta(days=1))  # same week
    [mail] = [m for m in list_docs("emailOutbox") if m["template"] == "ypt_weekly"]
    assert mail["to"] == "lead@example.test"
    for name in ("Thirty Person", "Seven Person", "Lapsed Person", "Ancient Person"):
        assert name in mail["text"]
    assert "Fine Person" not in mail["text"] and "Mom Person" not in mail["text"]
    assert "Ava" not in mail["text"] and "Sam" not in mail["text"]
    assert read(f"{T}/yptReminders/_weekly")["weekOf"] == "2026-10-12"
    run(NOW + timedelta(days=5))  # the next Monday
    assert len([m for m in list_docs("emailOutbox") if m["template"] == "ypt_weekly"]) == 2


def test_renewing_starts_the_schedule_again(run):
    run()
    assert sent("ypt_7") == ["seven"]
    owner.set(
        f"{T}/members/m-seven", {**read(f"{T}/members/m-seven"), "yptExpiresAt": ypt(8)}
    )  # a new date, 8 days out
    run(NOW + timedelta(days=1))  # now 7 days out
    assert sent("ypt_7") == ["seven", "seven"]
    assert read(f"{T}/yptReminders/m-seven")["expiresOn"] == (NOW + timedelta(days=8)).date().isoformat()


def test_a_troop_with_nobody_to_remind_is_quiet(run):
    reset()
    owner.set("troops/empty", {"name": "Empty", "unitNumber": "1"})
    assert run() == {"reminders": 0, "weekly": 0}
    assert list_docs("emailOutbox") == []


# --- health form dates ---


def record(uid: str, member: str, part="partsAB", date="2026-09-01", troop=TID):
    return call("record_health_form", uid, {"troopId": troop, "memberId": member, "part": part, "date": date})


def test_parents_leaders_and_the_person_record_dates_and_others_cannot():
    assert record("mom", "s1").status_code == 200  # a parent, for their own Scout
    assert record("mom", "m-mom", "partC").status_code == 200  # and for themselves
    assert record("mom", "s2").status_code == 403  # not their Scout
    assert record("mom", "m-lead").status_code == 403
    assert record("lead", "s2").status_code == 200  # a leader, for anyone
    assert record("scout1", "s1").status_code == 200  # the Scout, for themselves
    assert record("scout1", "s2").status_code == 403
    assert record("fine", "m-fine").status_code == 200  # an adult, for themselves
    assert record("fine", "s1").status_code == 403
    assert record("stranger", "s1").status_code == 403
    assert record("lead", "nobody").status_code == 404


def test_the_server_stamps_who_recorded_a_date_and_when_and_keeps_parts_apart():
    assert record("mom", "s1", "partsAB", "2026-09-01").status_code == 200
    assert record("lead", "s1", "partC", "2026-10-01").status_code == 200
    form = read(f"{T}/healthForms/s1")
    assert form["partsAB"]["date"] == "2026-09-01" and form["partsAB"]["byMemberId"] == "m-mom"
    assert form["partC"]["date"] == "2026-10-01" and form["partC"]["byMemberId"] == "m-lead"
    assert form["partsAB"]["at"] and form["partC"]["at"]
    assert set(form) == {"partsAB", "partC"}  # dates only: nothing else is stored
    assert record("mom", "s1", "partsAB", "2026-10-02").status_code == 200  # a newer date replaces the old one
    assert read(f"{T}/healthForms/s1")["partsAB"]["date"] == "2026-10-02"
    assert read(f"{T}/healthForms/s1")["partC"]["byMemberId"] == "m-lead"


def test_bad_dates_and_parts_are_refused_and_nothing_is_saved():
    for bad in (
        {"date": "2099-01-01"},
        {"date": "not a date"},
        {"date": "1990-01-01"},
        {"part": "partD"},
        {"part": None},
    ):
        response = record("mom", "s1", **({"part": "partsAB", "date": "2026-09-01"} | bad))
        assert response.status_code == 400, bad
    assert call("record_health_form", "mom", {"troopId": TID, "part": "partC", "date": "2026-09-01"}).status_code == 400
    assert read(f"{T}/healthForms/s1") is None


def test_a_parent_and_the_leader_read_the_dates_back_through_the_rules():
    record("mom", "s1")
    assert Client("mom").get(f"{T}/healthForms/s1") == 200
    assert Client("lead").get(f"{T}/healthForms/s1") == 200
    assert Client("fine").get(f"{T}/healthForms/s1") == 403
    assert Client("mom").set(f"{T}/healthForms/s1", {"partsAB": {"date": "2026-10-01"}}) == 403


def test_a_leader_sets_the_health_form_an_event_needs_and_reads_everyones_dates_for_its_roster():
    owner.set(f"{T}/events/e1", {"title": "Camp", "start": "2026-12-01", "endDate": "2026-12-03"})
    camp = {"title": "Camp", "start": "2026-12-01", "endDate": "2026-12-03"}
    assert Client("lead").set(f"{T}/events/e1", {**camp, "healthForm": "abc"}) == 200
    assert Client("mom").set(f"{T}/events/e1", {**camp, "healthForm": "ab"}) == 403
    assert read(f"{T}/events/e1")["healthForm"] == "abc"
    record("mom", "s1")
    record("lead", "s2", "partC")
    assert len(list_docs(f"{T}/healthForms")) == 2
    assert Client("lead").get(f"{T}/healthForms/s2") == 200 and Client("mom").get(f"{T}/healthForms/s2") == 403


# --- erasing ---


def test_removing_a_scout_erases_their_health_form_dates():
    record("mom", "s1")
    record("lead", "s2")
    result = call("remove_scout", "lead", {"troopId": TID, "scoutId": "s1", "confirm": True})
    assert result.status_code == 200, result.text
    assert read(f"{T}/healthForms/s1") is None
    assert read(f"{T}/healthForms/s2") is not None  # another Scout's dates stay


def test_deleting_an_adults_account_erases_their_dates_and_reminder_record(run):
    run()
    record("seven", "m-seven")
    owner.set(
        "users/seven",
        {"troops": {TID: {"name": "Troop 9", "unitNumber": "9", "memberId": "m-seven", "roles": ["counselor"]}}},
    )
    assert read(f"{T}/yptReminders/m-seven") is not None
    assert call("delete_account", "seven", {"confirm": True}).status_code == 200
    assert read(f"{T}/healthForms/m-seven") is None
    assert read(f"{T}/yptReminders/m-seven") is None
    assert read(f"{T}/members/m-seven") is None
    assert read(f"{T}/yptReminders/m-thirty") is not None  # others' records stay


# --- an adult enters their own training date ---


def own_date(uid: str, days: int, troop=TID):
    day = (NOW + timedelta(days=days)).date().isoformat()
    return call("set_my_ypt", uid, {"troopId": troop, "yptExpiresAt": day})


def test_an_adult_enters_their_own_date_on_the_member_and_the_access_record():
    response = own_date("lapsed", 365)
    assert response.status_code == 200, response.text
    for path in (f"{T}/members/m-lapsed", f"{T}/access/lapsed"):
        doc = read(path)
        assert doc["yptExpiresAt"] and doc["yptUpdatedBy"] == "self" and doc["yptUpdatedAt"]
    assert read(f"{T}/members/m-lapsed")["yptExpiresAt"] == read(f"{T}/access/lapsed")["yptExpiresAt"]


def test_dates_in_the_past_or_over_three_years_away_are_refused_and_scouts_and_strangers_cannot():
    before = read(f"{T}/members/m-seven")
    assert own_date("seven", -1).status_code == 400
    assert own_date("seven", 365 * 3 + 30).status_code == 400
    assert call("set_my_ypt", "seven", {"troopId": TID, "yptExpiresAt": "soon"}).status_code == 400
    assert read(f"{T}/members/m-seven") == before
    assert own_date("scout1", 100).status_code == 403
    assert own_date("stranger", 100).status_code == 403


def test_a_new_date_restarts_the_reminders_and_a_leaders_change_is_recorded_as_theirs(run):
    run()
    assert own_date("seven", 8).status_code == 200
    run(NOW + timedelta(days=1))  # 7 days out on the new date
    assert sent("ypt_7") == ["seven", "seven"]
    day = (NOW + timedelta(days=300)).date().isoformat()
    roles = {"troopId": TID, "memberId": "m-seven", "roles": ["counselor"], "yptExpiresAt": day}
    assert call("set_member_roles", "lead", roles).status_code == 200
    assert read(f"{T}/members/m-seven")["yptUpdatedBy"] == "m-lead"
    assert own_date("seven", 200).status_code == 200
    assert read(f"{T}/members/m-seven")["yptUpdatedBy"] == "self"


def test_the_expiry_date_itself_gets_the_final_notice(run):
    owner.set(f"{T}/members/m-fine", {**read(f"{T}/members/m-fine"), "yptExpiresAt": ypt(0)})
    run()
    assert sent("ypt_lapsed") == ["fine", "lapsed"]
