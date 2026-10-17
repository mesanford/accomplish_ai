"""End-to-end: event sign-ups, waitlist, parent permission, fees, reminders and the calendar feeds, on the emulators."""

import os
import time
from datetime import date, timedelta

import pytest
import requests

from tests.integration.test_functions import FUNCTIONS, call, owner, wait_for
from tests.rules.emulator import PROJECT, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
AUTH = f"http://{os.environ.get('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')}"
T = "troops/tn"
EV = f"{T}/events/e1"
SOON = (date.today() + timedelta(days=20)).isoformat()
CONFIG = {
    "enabled": True,
    "audience": "both",
    "capacity": 2,
    "deadline": (date.today() + timedelta(days=10)).isoformat(),
    "needsPermission": True,
    "questions": [
        {"id": "diet", "label": "Dietary needs", "type": "text"},
        {"id": "size", "label": "T-shirt size", "type": "choice", "choices": ["S", "M", "L"], "required": True},
    ],
}
ANSWERS = {"size": "M", "diet": "none"}
USERS = ["lead", "mom", "dad", "scout1", "ref", "outsider", "treas"]


def mail(uid: str) -> str:
    return f"{uid}@example.test"


def outbox(template: str) -> list[dict]:
    return [m for m in list_docs("emailOutbox") if m["template"] == template]


def sent_to(template: str, count: int) -> set[str]:
    wait_for(lambda: len(outbox(template)) >= count)
    time.sleep(1.5)  # give a stray extra email time to show up
    sent = outbox(template)
    assert len(sent) == count, [m["to"] for m in sent]
    return {m["to"] for m in sent}


def event(**over) -> dict:
    return {"title": "Campout", "start": SOON, "place": "Camp Lowden", "signups": CONFIG, **over}


def go(uid: str, member: str, **extra):
    data = {"troopId": "tn", "eventId": "e1", "memberId": member, "answers": ANSWERS, **extra}
    return call("sign_up_for_event", uid, data)


def status(member: str) -> str:
    return read(f"{EV}/signups/{member}")["status"]


@pytest.fixture(autouse=True)
def seeded():
    reset()
    requests.delete(f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts", timeout=10)
    users = [{"localId": uid, "email": mail(uid)} for uid in USERS]
    url = f"{AUTH}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:batchCreate"
    requests.post(url, json={"users": users}, headers={"Authorization": "Bearer owner"}, timeout=10).raise_for_status()
    owner.set(T, {"name": "Troop 9", "unitNumber": "9"})
    scouts = {"s1": ("Ava Jones", 2010), "s2": ("Max Jones", 2016), "s3": ("Sam Lee", 2010)}
    for sid, (name, year) in scouts.items():
        guardian = ["m-dad"] if sid == "s3" else ["m-mom"]
        owner.set(f"{T}/members/{sid}", {"kind": "scout", "displayName": name, "guardianIds": guardian})
        owner.set(f"{T}/scoutRecords/{sid}", {"birthYear": year, "birthMonth": 1, "currentRankId": "scout"})
    adults = {
        "lead": ["leader"],
        "mom": ["parent"],
        "dad": ["parent"],
        "ref": ["committee"],
        "outsider": ["committee"],
        "treas": ["treasurer"],
    }
    for uid, roles in adults.items():
        owner.set(f"{T}/members/m-{uid}", {"kind": "adult", "displayName": uid.title(), "uid": uid, "roles": roles})
        access = {"memberId": f"m-{uid}", "roles": roles, "scoutIds": []}
        access["scoutIds"] = {"mom": ["s1", "s2"], "dad": ["s3"]}.get(uid, [])
        owner.set(f"{T}/access/{uid}", access)
    owner.set(f"{T}/access/scout1", {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]})
    owner.set(EV, event())
    yield


def test_a_parent_signs_up_a_young_scout_and_that_is_permission():
    assert go("mom", "s2").status_code == 400  # must say they give permission
    assert go("mom", "s2", permission=True, healthNote="Peanut allergy").status_code == 200
    doc = read(f"{EV}/signups/s2")
    assert doc["status"] == "going" and doc["permission"]["state"] == "approved"
    assert doc["permission"]["byMemberId"] == "m-mom" and doc["permission"]["at"]
    assert read(f"{EV}/signupNotes/s2")["note"] == "Peanut allergy"
    assert read(EV)["signupCounts"]["going"] == 1
    assert go("mom", "s2", permission=True).status_code == 409  # already signed up


def test_required_answers_and_choices_are_checked():
    assert (
        call(
            "sign_up_for_event", "mom", {"troopId": "tn", "eventId": "e1", "memberId": "s2", "permission": True}
        ).status_code
        == 400
    )
    assert go("mom", "s2", permission=True, answers={"size": "XXL"}).status_code == 400
    assert read(f"{EV}/signups/s2") is None


def test_a_scout_13_or_older_signs_up_and_waits_for_a_parent():
    assert go("scout1", "s1").status_code == 200
    assert status("s1") == "waiting_permission"
    assert sent_to("event_permission_needed", 1) == {mail("mom")}  # the parent, never the Scout
    assert (
        "Ava" in outbox("event_permission_needed")[0]["text"]
        and "Jones" not in outbox("event_permission_needed")[0]["text"]
    )

    assert call("approve_permission", "dad", {"troopId": "tn", "eventId": "e1", "memberId": "s1"}).status_code == 403
    assert call("approve_permission", "lead", {"troopId": "tn", "eventId": "e1", "memberId": "s1"}).status_code == 403
    assert call("approve_permission", "scout1", {"troopId": "tn", "eventId": "e1", "memberId": "s1"}).status_code == 403
    assert status("s1") == "waiting_permission"

    note = {"troopId": "tn", "eventId": "e1", "memberId": "s1", "healthNote": "Wears glasses"}
    assert call("approve_permission", "mom", note).status_code == 200
    doc = read(f"{EV}/signups/s1")
    assert (
        doc["status"] == "going" and doc["permission"]["byMemberId"] == "m-mom" and doc["permission"]["byName"] == "Mom"
    )
    assert read(f"{EV}/signupNotes/s1")["note"] == "Wears glasses"
    assert read(EV)["signupCounts"] == {"held": 1, "going": 1, "waitingPermission": 0, "waitlist": 0}


def test_a_scout_under_13_cannot_sign_themselves_up_and_a_family_cannot_sign_up_another_scout():
    owner.set(f"{T}/access/scout1", {"memberId": "s2", "roles": ["scout"], "scoutIds": ["s2"]})
    assert go("scout1", "s2").status_code == 400
    assert go("dad", "s1", permission=True).status_code == 400
    assert go("mom", "m-ref").status_code == 400  # a parent can't sign up another adult
    assert list_docs(f"{EV}/signups") == []


def test_adults_sign_themselves_up_and_the_audience_is_enforced():
    assert go("ref", "m-ref").status_code == 200 and status("m-ref") == "going"
    owner.set(EV, event(signups={**CONFIG, "audience": "scouts"}))
    assert go("outsider", "m-outsider").status_code == 400
    owner.set(EV, event(signups={**CONFIG, "audience": "adults"}))
    assert go("mom", "s2", permission=True).status_code == 400


def test_full_events_use_a_waitlist_and_cancelling_promotes_and_emails_the_parent():
    owner.set(EV, event(signups={**CONFIG, "capacity": 1}))
    assert go("mom", "s2", permission=True).status_code == 200
    assert go("dad", "s3", permission=True).status_code == 200
    assert status("s2") == "going" and status("s3") == "waitlist"
    assert call("cancel_signup", "dad", {"troopId": "tn", "eventId": "e1", "memberId": "s2"}).status_code == 403
    assert call("cancel_signup", "mom", {"troopId": "tn", "eventId": "e1", "memberId": "s2"}).json()["result"] == {
        "promoted": 1
    }
    assert read(f"{EV}/signups/s2") is None and status("s3") == "going"
    assert sent_to("event_waitlist_promoted", 1) == {mail("dad")}
    assert read(EV)["signupCounts"] == {"held": 1, "going": 1, "waitingPermission": 0, "waitlist": 0}


def test_a_parent_who_turned_notifications_off_gets_no_promotion_email():
    owner.set("users/dad", {"emailNotifications": False})
    owner.set(EV, event(signups={**CONFIG, "capacity": 1}))
    go("mom", "s2", permission=True)
    go("dad", "s3", permission=True)
    call("cancel_signup", "lead", {"troopId": "tn", "eventId": "e1", "memberId": "s2"})
    wait_for(lambda: status("s3") == "going")
    time.sleep(2)
    assert outbox("event_waitlist_promoted") == []


def test_raising_the_capacity_lets_the_waitlist_in_and_the_first_in_line_goes_first():
    owner.set(EV, event(signups={**CONFIG, "capacity": 1}))
    go("mom", "s2", permission=True)
    go("dad", "s3", permission=True)
    go("ref", "m-ref")
    assert [status(i) for i in ("s2", "s3", "m-ref")] == ["going", "waitlist", "waitlist"]
    owner.set(EV, {**read(EV), "signups": {**CONFIG, "capacity": 2}})
    wait_for(lambda: status("s3") == "going")
    time.sleep(1)
    assert status("m-ref") == "waitlist"
    assert sent_to("event_waitlist_promoted", 1) == {mail("dad")}


def test_the_deadline_stops_families_but_not_leaders():
    yesterday = (date.today() - timedelta(days=2)).isoformat()
    owner.set(EV, event(signups={**CONFIG, "deadline": yesterday}))
    assert go("mom", "s2", permission=True).status_code == 400
    assert go("lead", "s2").status_code == 200
    assert status("s2") == "waiting_permission"  # a leader can't give permission for the family
    owner.set(EV, event(signups={**CONFIG, "closed": True}))
    assert go("dad", "s3", permission=True).status_code == 400


def test_a_leader_can_remove_anyone_and_others_cannot():
    go("mom", "s2", permission=True)
    assert call("cancel_signup", "outsider", {"troopId": "tn", "eventId": "e1", "memberId": "s2"}).status_code == 403
    assert call("cancel_signup", "lead", {"troopId": "tn", "eventId": "e1", "memberId": "s2"}).status_code == 200
    assert read(f"{EV}/signups/s2") is None and read(f"{EV}/signupNotes/s2") is None
    assert call("cancel_signup", "lead", {"troopId": "tn", "eventId": "e1", "memberId": "s2"}).status_code == 404


def test_earlier_rsvps_can_be_imported_once():
    owner.set(f"{EV}/rsvps/s2", {"going": True})
    owner.set(f"{EV}/rsvps/s3", {"going": False})
    owner.set(f"{EV}/rsvps/m-ref", {"going": True})
    assert call("import_rsvps", "mom", {"troopId": "tn", "eventId": "e1"}).status_code == 403
    assert call("import_rsvps", "lead", {"troopId": "tn", "eventId": "e1"}).json()["result"] == {"imported": 2}
    assert call("import_rsvps", "lead", {"troopId": "tn", "eventId": "e1"}).json()["result"] == {"imported": 0}
    assert status("s2") == "waiting_permission" and status("m-ref") == "going"
    assert read(f"{EV}/rsvps/s2") == {"going": True}  # kept as it was


def test_the_treasurer_charges_fees_to_scout_accounts_once():
    owner.set(EV, event(feeCents=2500, signups={**CONFIG, "capacity": 5}))
    go("mom", "s2", permission=True)
    go("scout1", "s1")  # waiting for permission: not charged as "going"
    charge = {"troopId": "tn", "eventId": "e1", "who": "going"}
    assert call("charge_event_fees", "mom", charge).status_code == 403
    assert call("charge_event_fees", "lead", charge).status_code == 403  # money is the treasurer's
    assert call("charge_event_fees", "treas", {**charge, "who": "nobody"}).status_code == 400
    assert call("charge_event_fees", "treas", charge).json()["result"] == {"charged": 1, "state": "posted"}
    assert call("charge_event_fees", "treas", charge).json()["result"] == {"charged": 0, "state": None}
    assert read(f"{EV}/feeStatus/s2")["state"] == "posted" and read(f"{EV}/feeStatus/s1") is None
    assert read(EV)["feesPosted"]["count"] == 1
    assert read(f"{T}/accounts/s2")["openChargesCents"] == 2500  # no credit yet, so the charge stays open

    owner.set(f"{EV}/attendance/s2", {"present": True})
    owner.set(f"{EV}/attendance/s3", {"present": True})
    assert call("charge_event_fees", "treas", {**charge, "who": "attendees"}).json()["result"]["charged"] == 1
    assert read(f"{EV}/feeStatus/s3")["state"] == "posted" and read(EV)["feesPosted"]["count"] == 2


def test_charging_needs_a_fee():
    assert call("charge_event_fees", "treas", {"troopId": "tn", "eventId": "e1", "who": "going"}).status_code == 400


def test_the_reminder_goes_to_signed_up_families_once(monkeypatch):
    """`run_reminders` runs as the deployed job would; the scheduled trigger itself can't fire on the emulators."""
    monkeypatch.setenv("FUNCTIONS_EMULATOR", "true")
    monkeypatch.setenv("GCLOUD_PROJECT", PROJECT)
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", AUTH.removeprefix("http://"))
    from datetime import UTC, datetime

    from endpoints.event_reminders import run_reminders

    in_two_days = (date.today() + timedelta(days=2)).isoformat()
    owner.set(EV, event(start=in_two_days, signups={**CONFIG, "capacity": 5}))
    owner.set(f"{T}/events/e2", {"title": "Hike", "start": in_two_days})  # sign-ups off: no reminder
    owner.set(f"{T}/events/e3", event(start=SOON))  # not two days away
    go("mom", "s2", permission=True)
    go("dad", "s3", permission=True)
    go("scout1", "s1")  # waiting for permission
    go("ref", "m-ref")
    owner.set("users/dad", {"emailNotifications": False})
    noon = datetime.combine(date.today(), datetime.min.time(), tzinfo=UTC).replace(hour=14)

    first = run_reminders(noon)
    assert first["events"] == 1
    assert {m["to"] for m in outbox("event_reminder")} == {mail("mom"), mail("ref")}  # not dad (opted out), not Scouts
    mom = next(m for m in outbox("event_reminder") if m["to"] == mail("mom"))
    assert "Max" in mom["text"] and "Ava still needs a parent" in mom["text"] and "Jones" not in mom["text"]
    assert read(EV)["reminderSentFor"] == in_two_days

    assert run_reminders(noon)["events"] == 0  # a rerun sends nothing
    assert len(outbox("event_reminder")) == 2
    owner.set(EV, {**read(EV), "start": (date.today() + timedelta(days=3)).isoformat()})
    assert run_reminders(noon + timedelta(days=1))["events"] == 1  # a moved event is reminded again


def feed(path: str) -> requests.Response:
    return requests.get(f"{FUNCTIONS}/{PROJECT}/us-central1/calendar_feed{path}", timeout=30)


def feed_token(uid: str, name: str = "get_calendar_feed") -> str:
    response = call(name, uid, {"troopId": "tn"})
    assert response.status_code == 200, response.text
    return response.json()["result"]["path"].removeprefix("/cal/").removesuffix(".ics")


def test_each_member_gets_a_private_feed_that_can_be_reset():
    go("mom", "s2", permission=True)
    assert call("get_calendar_feed", "stranger", {"troopId": "tn"}).status_code == 403
    token = feed_token("mom")
    assert len(token) >= 43 and feed_token("mom") == token and feed_token("dad") != token
    response = feed(f"/cal/{token}.ics")
    assert response.status_code == 200 and response.headers["Content-Type"].startswith("text/calendar")
    text = response.text
    assert text.startswith("BEGIN:VCALENDAR\r\n") and text.endswith("END:VCALENDAR\r\n")
    assert "SUMMARY:Campout" in text and "LOCATION:Camp Lowden" in text and "DTSTART;VALUE=DATE:" in text
    for private in ("Max", "Jones", "Ava", "signups"):
        assert private not in text

    fresh = feed_token("mom", "reset_calendar_feed")
    assert fresh != token
    assert feed(f"/cal/{token}.ics").status_code == 404 and feed(f"/cal/{fresh}.ics").status_code == 200
    assert feed(f"/cal/{'x' * 43}.ics").status_code == 404 and feed("/cal/short.ics").status_code == 404


def test_a_feed_stops_when_the_person_leaves_the_troop():
    membership = {"name": "Troop 9", "unitNumber": "9", "memberId": "m-ref", "roles": ["committee"]}
    owner.set("users/ref", {"troops": {"tn": membership}})
    token = feed_token("ref")
    assert feed(f"/cal/{token}.ics").status_code == 200
    assert call("delete_account", "ref", {"confirm": True}).status_code == 200
    assert feed(f"/cal/{token}.ics").status_code == 404
    assert read(f"{T}/calendarTokens/ref") is None and read(f"calendarFeeds/{token}") is None


def test_the_public_feed_lists_only_public_events():
    public = [{"title": "Open house", "start": SOON, "place": "Town hall"}]
    owner.set("publicSites/troop-9", {"slug": "troop-9", "troopName": "Troop 9", "events": public})
    owner.set(EV, event(**{"public": False}))
    response = feed("/cal/site/troop-9.ics")
    assert response.status_code == 200 and "SUMMARY:Open house" in response.text
    assert "Campout" not in response.text and "Camp Lowden" not in response.text
    assert feed("/cal/site/other.ics").status_code == 404


def test_removing_a_scout_erases_their_sign_ups_notes_and_fee_status():
    go("mom", "s2", permission=True, healthNote="Asthma")
    owner.set(f"{EV}/feeStatus/s2", {"state": "pending"})
    assert call("remove_scout", "lead", {"troopId": "tn", "scoutId": "s2", "confirm": True}).status_code == 200
    for sub in ("signups", "signupNotes", "feeStatus"):
        assert read(f"{EV}/{sub}/s2") is None
