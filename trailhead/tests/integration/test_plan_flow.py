"""plan_action on the Functions emulator: a leader plans a campout, checks it, publishes it as an event, and the
event then behaves like any other. One small batch, run in its own `emulators:exec`."""

import os
from datetime import UTC, datetime, timedelta

import pytest

from tests.integration.test_functions import call, owner
from tests.rules.emulator import list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
T = "troops/t1"
FUTURE = datetime.now(UTC) + timedelta(days=365)
START = (datetime.now(UTC) + timedelta(days=40)).date().isoformat()
END = (datetime.now(UTC) + timedelta(days=42)).date().isoformat()


@pytest.fixture(autouse=True)
def troop():
    reset()
    owner.set(T, {"unitNumber": "123", "timezone": "America/Chicago"})
    people = {
        "leader": ("m-leader", ["leader", "scoutmaster"]),
        "committee": ("m-com", ["committee"]),
        "parent": ("m-parent", ["parent"]),
    }
    for uid, (member_id, roles) in people.items():
        owner.set(f"{T}/access/{uid}", {"memberId": member_id, "roles": roles, "scoutIds": [], "yptExpiresAt": FUTURE})
        owner.set(f"{T}/members/{member_id}", {"kind": "adult", "displayName": uid.title()})
    owner.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam"})
    yield


def act(uid: str, op: str, **data):
    return call("plan_action", uid, {"troopId": "t1", "op": op, **data})


def ok(response) -> dict:
    assert response.status_code == 200, response.text
    return response.json()["result"]


def core(**seg) -> dict:
    segment = {"start": START, "endDate": END, "place": "Pine Lake", "logKind": "campout", "feeCents": 2500, **seg}
    segment["logValues"] = {"nights": 2}
    segment["signups"] = {"enabled": True, "needsPermission": True}
    return {"title": "Fall campout", "kind": "campout", "headcount": {"scouts": 8, "adults": 2}, "segments": [segment]}


def a_ready_plan() -> str:
    plan_id = ok(act("committee", "create_from_template", kind="campout", title="Fall campout"))["planId"]
    ok(act("committee", "update_core", planId=plan_id, core=core()))
    staffing = {"adultMemberIds": ["m-leader", "m-com"], "transport": "families"}
    results = ok(act("committee", "set_staffing", planId=plan_id, staffing=staffing))["results"]
    assert [r["status"] for r in results] == ["pass", "pass", "pass"]
    return plan_id


def test_a_template_plan_gets_milestones_dated_from_the_first_day():
    plan_id = a_ready_plan()
    milestones = list_docs(f"{T}/eventPlans/{plan_id}/milestones")
    assert len(milestones) == 9
    reserve = next(m for m in milestones if m["title"] == "Reserve the site")
    assert reserve["dueOn"] == (datetime.fromisoformat(START) - timedelta(days=45)).date().isoformat()


def test_only_planners_create_and_only_leaders_publish():
    assert act("parent", "create_from_template", kind="campout", title="X").status_code == 403
    plan_id = a_ready_plan()
    assert act("committee", "publish", planId=plan_id, dryRun=True).status_code == 403
    assert act("parent", "update_core", planId=plan_id, core=core()).status_code == 403


def test_scouts_can_not_be_named_as_staff():
    plan_id = a_ready_plan()
    response = act("leader", "set_staffing", planId=plan_id, staffing={"adultMemberIds": ["s1"]})
    assert response.status_code == 400


def test_publish_is_blocked_until_checks_pass_or_are_acknowledged():
    plan_id = ok(act("leader", "create_from_template", kind="service", title="Food bank"))["planId"]
    ok(act("leader", "update_core", planId=plan_id, core=core(logKind="service")))
    blocked = act("leader", "publish", planId=plan_id)
    assert blocked.status_code == 400 and "Two-deep" in blocked.text
    ok(act("leader", "acknowledge", planId=plan_id, ruleId="two_deep", note="District adults join us"))
    ok(act("leader", "acknowledge", planId=plan_id, ruleId="transport", note="Families drive"))
    assert ok(act("leader", "publish", planId=plan_id))["created"] is True


def test_publish_creates_one_event_and_a_retry_does_not_make_another():
    plan_id = a_ready_plan()
    preview = ok(act("leader", "publish", planId=plan_id, dryRun=True))
    assert preview["mode"] == "create" and preview["event"]["healthForm"] == "ab"
    first = ok(act("leader", "publish", planId=plan_id))
    again = ok(act("leader", "publish", planId=plan_id, fields=[]))
    assert again["eventId"] == first["eventId"]
    events = list_docs(f"{T}/events")
    assert len(events) == 1
    event = read(f"{T}/events/{first['eventId']}")
    assert event["planId"] == plan_id and event["public"] is False and event["place"] == "Pine Lake"
    assert "alertedFor" not in event  # creating an event sends no alert
    summary = read(f"{T}/planSummaries/{plan_id}")
    assert summary["eventIds"] == [first["eventId"]]
    assert "staffing" not in summary


def test_republish_writes_only_ticked_fields_and_shows_edits_made_on_the_event():
    plan_id = a_ready_plan()
    event_id = ok(act("leader", "publish", planId=plan_id))["eventId"]
    owner.set(f"{T}/events/{event_id}", {**read(f"{T}/events/{event_id}"), "startTime": "18:00"})
    ok(act("leader", "update_core", planId=plan_id, core=core(place="Cedar Ridge", feeCents=3000)))
    preview = ok(act("leader", "publish", planId=plan_id, dryRun=True))
    rows = {r["field"]: r for r in preview["diff"]}
    assert set(rows) == {"place", "feeCents", "startTime"}
    assert rows["startTime"]["editedOnEvent"] is True and rows["place"]["editedOnEvent"] is False
    assert ok(act("leader", "publish", planId=plan_id, fields=["place"]))["updated"] == ["place"]
    event = read(f"{T}/events/{event_id}")
    assert (event["place"], event["feeCents"], event["startTime"]) == ("Cedar Ridge", 2500, "18:00")
    assert ok(act("leader", "reconcile", planId=plan_id))["drift"] == ["startTime"]


def test_cancel_plan_cancels_the_upcoming_event_and_delete_leaves_the_event_on_the_calendar():
    plan_id = a_ready_plan()
    event_id = ok(act("leader", "publish", planId=plan_id))["eventId"]
    assert ok(act("leader", "cancel_plan", planId=plan_id, note="Burn ban"))["eventCancelled"] is True
    assert read(f"{T}/events/{event_id}")["cancelNote"] == "Burn ban"
    ok(act("leader", "delete_plan", planId=plan_id))
    event = read(f"{T}/events/{event_id}")
    assert event is not None and "planId" not in event
    assert read(f"{T}/eventPlans/{plan_id}") is None and read(f"{T}/planSummaries/{plan_id}") is None


def test_a_plan_started_from_an_event_is_linked_without_changing_it():
    owner.set(f"{T}/events/e1", {"title": "Klondike", "start": START, "logKind": "campout", "healthForm": "abc"})
    plan_id = ok(act("leader", "create_from_event", eventId="e1"))["planId"]
    assert read(f"{T}/events/e1")["planId"] == plan_id
    plan = read(f"{T}/eventPlans/{plan_id}")
    assert plan["status"] == "published" and plan["segments"][0]["partC"] is True
    assert act("leader", "create_from_event", eventId="e1").status_code == 400


def test_drive_time_checks_who_asks_and_the_link_and_never_calls_the_service_here():
    plan_id = a_ready_plan()
    good = {"troopId": "t1", "planId": plan_id, "mapsUrl": "https://maps.app.goo.gl/AbC123"}
    assert call("estimate_drive_time", "parent", good).status_code == 403
    bad = call("estimate_drive_time", "leader", {**good, "mapsUrl": "https://evil.example/maps/@1.0,2.0"})
    assert bad.status_code == 400 and "Google Maps" in bad.text
    here = call("estimate_drive_time", "leader", good)
    assert here.status_code == 400 and "aren't set up here" in here.text
    assert read(f"{T}/usage/drive_{datetime.now(UTC).date().isoformat()}") is None  # no quota used


def test_planners_save_a_brief_and_a_clone_keeps_it():
    plan_id = a_ready_plan()
    raw = {"maxDriveMinutes": 120, "budgetCents": 4000, "lodging": "cabins", "mustHaves": ["showers", "water", "spa"]}
    ok(act("committee", "update_brief", planId=plan_id, brief=raw))
    assert read(f"{T}/eventPlans/{plan_id}")["brief"]["mustHaves"] == ["water", "showers"]
    assert act("parent", "update_brief", planId=plan_id, brief=raw).status_code == 403
    assert act("leader", "update_brief", planId=plan_id, brief={"maxDriveMinutes": 5000}).status_code == 400
    copy = ok(act("leader", "clone_plan", planId=plan_id))["planId"]
    assert read(f"{T}/eventPlans/{copy}")["brief"]["lodging"] == "cabins"
