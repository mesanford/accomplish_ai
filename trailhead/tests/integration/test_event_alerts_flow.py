"""End-to-end: change and cancellation alerts, and repeating events, on the emulators."""

import os
import time
from datetime import date, timedelta

import pytest
import requests

from tests.integration.test_functions import call, owner, wait_for
from tests.rules.emulator import DOCS, PROJECT, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
AUTH = f"http://{os.environ.get('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')}"
T = "troops/ta"
EV = f"{T}/events/e1"
ADULTS = {"lead": ["leader"], "mom": ["parent"], "dad": ["parent"], "ref": ["committee"]}
CONFIG = {"enabled": True, "audience": "both", "capacity": 10, "needsPermission": False, "questions": []}


def day(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


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


def event_ids() -> dict[str, str]:
    """{start date: event id} for the troop's events."""
    r = requests.get(f"{DOCS}/{T}/events", headers={"Authorization": "Bearer owner"}, timeout=10)
    r.raise_for_status()
    docs = r.json().get("documents", [])
    return {d["fields"]["start"]["stringValue"]: d["name"].rsplit("/", 1)[1] for d in docs}


def quiet(template: str, count: int) -> None:
    """Nothing more than `count` arrives."""
    time.sleep(3)
    assert len(outbox(template)) == count


@pytest.fixture(autouse=True)
def seeded():
    reset()
    requests.delete(f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts", timeout=10)
    users = [{"localId": uid, "email": mail(uid)} for uid in [*ADULTS, "scout1"]]
    url = f"{AUTH}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:batchCreate"
    requests.post(url, json={"users": users}, headers={"Authorization": "Bearer owner"}, timeout=10).raise_for_status()
    owner.set(T, {"name": "Troop 7", "unitNumber": "7"})
    owner.set(
        f"{T}/members/s1", {"kind": "scout", "displayName": "Ava Jones", "guardianIds": ["m-mom"], "uid": "scout1"}
    )
    owner.set(f"{T}/access/scout1", {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]})
    owner.set("users/scout1/devices/d1", {"token": "device-token-scout1"})  # pushes are only logged for a device
    for uid, roles in ADULTS.items():
        owner.set(f"{T}/members/m-{uid}", {"kind": "adult", "displayName": uid.title(), "uid": uid, "roles": roles})
        scouts = ["s1"] if uid == "mom" else []
        owner.set(f"{T}/access/{uid}", {"memberId": f"m-{uid}", "roles": roles, "scoutIds": scouts})


def test_moving_an_event_tells_the_families_signed_up_once():
    owner.set(EV, {"title": "Campout", "start": day(9), "place": "Camp Lowden", "signups": CONFIG})
    owner.set(
        f"{EV}/signups/s1", {"memberId": "s1", "kind": "scout", "spot": "held", "permission": {"state": "approved"}}
    )
    owner.set(f"{EV}/signups/m-ref", {"memberId": "m-ref", "kind": "adult", "spot": "held"})
    time.sleep(2)  # let the create triggers settle; creating says nothing
    assert outbox("event_changed") == []

    owner.set(EV, {**read(EV), "start": day(10), "place": "Camp Kiwanis"})
    assert sent_to("event_changed", 2) == {mail("mom"), mail("ref")}  # not dad or lead: not signed up
    mom = next(m for m in outbox("event_changed") if m["to"] == mail("mom"))
    assert mom["subject"] == "Changed: Campout"
    assert "Place: Camp Kiwanis (was Camp Lowden)." in mom["text"] and "New date:" in mom["text"]
    pushes = [p for p in list_docs("pushOutbox") if p["template"] == "event_changed"]
    assert "scout1" in {p["uid"] for p in pushes}  # the Scout hears by push, never email

    owner.set(EV, {**read(EV), "title": "Fall campout", "feeCents": 2500})  # not a detail families plan around
    quiet("event_changed", 2)


def test_cancelling_a_meeting_without_sign_ups_tells_the_whole_troop_and_restoring_too():
    owner.set(EV, {"title": "Troop meeting", "start": day(3), "startTime": "19:00"})
    time.sleep(2)
    owner.set(EV, {**read(EV), "cancelled": True, "cancelNote": "The church hall is closed."})
    assert sent_to("event_changed", 4) == {mail(u) for u in ADULTS}
    one = outbox("event_changed")[0]
    assert one["subject"] == "Cancelled: Troop meeting" and "The church hall is closed." in one["text"]
    # Scouts hear only about their own sign-ups (privacy policy), so the Scout's own login gets no notification.
    assert all(p["uid"] != "scout1" for p in list_docs("pushOutbox") if p["template"] == "event_changed")

    owner.set(EV, {**read(EV), "cancelled": False})
    wait_for(lambda: len(outbox("event_changed")) >= 8)
    assert {m["subject"] for m in outbox("event_changed")} == {"Cancelled: Troop meeting", "Back on: Troop meeting"}


def test_an_event_without_sign_ups_a_month_away_tells_nobody():
    owner.set(EV, {"title": "Court of honor", "start": day(30)})
    time.sleep(2)
    owner.set(EV, {**read(EV), "place": "School gym"})
    quiet("event_changed", 0)


def test_a_leader_makes_a_weekly_series_and_changes_the_later_dates_with_one_email_each():
    data = {
        "troopId": "ta",
        "title": "Troop meeting",
        "start": day(3),
        "until": day(24),
        "pattern": "weekly",
        "place": "Church hall",
        "startTime": "19:00",
        "endTime": "20:30",
        "public": True,
    }
    assert call("create_event_series", "mom", data).status_code == 403
    made = call("create_event_series", "lead", data).json()["result"]
    assert made["count"] == 4
    series = read(f"{T}/eventSeries/{made['seriesId']}")
    assert series["count"] == 4 and series["label"].startswith("Every ")
    events = sorted((e for e in list_docs(f"{T}/events")), key=lambda e: e["start"])
    assert [e["start"] for e in events] == [day(3), day(10), day(17), day(24)]
    assert all(e["seriesId"] == made["seriesId"] and e["startTime"] == "19:00" and e["public"] for e in events)
    second = event_ids()[day(10)]

    change = {"troopId": "ta", "seriesId": made["seriesId"], "fromEventId": second, "changes": {"startTime": "19:30"}}
    assert call("update_event_series", "lead", change).json()["result"]["updated"] == 3
    times = {e["start"]: e["startTime"] for e in list_docs(f"{T}/events")}
    assert times == {day(3): "19:00", day(10): "19:30", day(17): "19:30", day(24): "19:30"}
    assert sent_to("series_changed", 4) == {mail(u) for u in ADULTS}  # one each for the whole change
    assert "(3 dates)" in outbox("series_changed")[0]["text"]
    quiet("event_changed", 0)  # the per-event trigger stays quiet

    stop = {"troopId": "ta", "seriesId": made["seriesId"], "fromEventId": second, "cancel": True}
    assert call("update_event_series", "lead", stop).json()["result"]["updated"] == 3
    assert sum(1 for e in list_docs(f"{T}/events") if e.get("cancelled")) == 3
    bad = {**change, "changes": {"startTime": "21:00"}}  # after the 20:30 end
    assert call("update_event_series", "lead", bad).status_code == 400
