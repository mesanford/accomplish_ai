from datetime import UTC, datetime, timedelta

import pytest

from handlers import plans_core as core
from handlers import plans_publish as pub
from handlers import plans_templates as tpl
from handlers.membership import InvalidInput
from handlers.plans_erase import plan_update, record_update

NOW = datetime(2026, 11, 1, tzinfo=UTC)


def a_plan(**seg) -> dict:
    segment = {
        "start": "2026-11-13",
        "endDate": "2026-11-15",
        "place": "Pine Lake",
        "logKind": "campout",
        "logValues": {"nights": 2},
        "feeCents": 2500,
        "signups": {"enabled": True, "needsPermission": True, "capacity": 20},
        **seg,
    }
    return core.core({"title": "Fall campout", "kind": "campout", "segments": [segment]})


# --- checking what planners send ---


def test_core_cleans_and_defaults():
    plan = a_plan()
    seg = plan["segments"][0]
    assert (plan["title"], plan["kind"], seg["id"]) == ("Fall campout", "campout", "s1")
    assert seg["logValues"] == {"nights": 2, "miles": 0, "serviceHours": 0}
    assert seg["signups"] == {"enabled": True, "capacity": 20, "needsPermission": True, "deadline": None}
    assert core.core({"title": "X", "kind": "rocket"})["kind"] == "other"


def test_core_refuses_bad_values():
    for bad in (
        {"title": " "},
        {"title": "x" * 121},
        {"title": "X", "segments": [{"start": "2026-11-15", "endDate": "2026-11-13"}]},
        {"title": "X", "segments": [{"start": "2026-11-15", "startTime": "10:00", "endTime": "09:00"}]},
        {"title": "X", "segments": [{"feeCents": 1_000_001}]},
        {"title": "X", "segments": [{"feeCents": 12.5}]},
        {"title": "X", "segments": [{"startTime": "25:00"}]},
        {"title": "X", "headcount": {"scouts": -1}},
    ):
        with pytest.raises(InvalidInput):
            core.core(bad)


def test_a_one_day_trip_drops_a_last_day_equal_to_the_first():
    assert a_plan(endDate="2026-11-13")["segments"][0]["endDate"] is None


def test_staffing_keeps_unique_adults_and_checks_drivers():
    staff = core.staffing(
        {"adultMemberIds": ["a1", "a1", "a2"], "transport": "carpool", "drivers": [{"memberId": "a1", "seats": 4}]}
    )
    assert staff["adultMemberIds"] == ["a1", "a2"]
    assert core.member_ids_in(staff) == {"a1", "a2"}
    with pytest.raises(InvalidInput):
        core.staffing({"drivers": [{"seats": 4}]})
    with pytest.raises(InvalidInput):
        core.staffing({"drivers": [{"memberId": "a1", "seats": 40}]})
    assert core.staffing({"transport": "jetpack"})["transport"] is None


def test_a_decision_must_name_one_of_the_plans_options():
    assert core.decision({"optionId": "o1", "tally": "6-2"}, {"o1"})["tally"] == "6-2"
    assert core.decision({}, {"o1"})["optionId"] is None
    with pytest.raises(InvalidInput):
        core.decision({"optionId": "o9"}, {"o1"})


def test_private_panel_limits_helpers():
    assert core.private({"helpers": ["Grandpa Joe"]})["helpers"] == ["Grandpa Joe"]
    with pytest.raises(InvalidInput):
        core.private({"helpers": ["x"] * 21})


# --- templates and milestones ---


def test_templates_give_a_backward_timeline():
    campout = tpl.template_milestones("campout")
    assert campout[0]["title"] == "Choose a site" and campout[0]["offsetDays"] == -60
    assert all(m["anchor"] == tpl.START for m in campout)
    assert tpl.template_milestones("other") == []
    assert tpl.template_milestones("nonsense") == []


def test_due_dates_follow_the_first_day_or_a_fixed_date():
    m = {"anchor": tpl.START, "offsetDays": -14}
    assert tpl.due_on(m, "2026-11-13") == "2026-10-30"
    assert tpl.due_on(m, None) is None
    assert tpl.due_on({"anchor": tpl.FIXED, "fixedOn": "2026-10-01"}, None) == "2026-10-01"
    assert tpl.overdue({"dueOn": "2026-10-30"}, "2026-11-01")
    assert not tpl.overdue({"dueOn": "2026-10-30", "done": {"byMemberId": "m"}}, "2026-11-01")


def test_milestone_input_is_checked():
    assert tpl.milestone({"title": "Book", "offsetDays": -30})["offsetDays"] == -30
    assert tpl.milestone({"title": "Pay", "anchor": "fixed", "fixedOn": "2026-12-01"})["fixedOn"] == "2026-12-01"
    for bad in ({"title": ""}, {"title": "X", "offsetDays": 2000}, {"title": "X", "anchor": "fixed"}):
        with pytest.raises(InvalidInput):
            tpl.milestone(bad)


# --- publishing ---


def test_a_new_event_carries_the_plan_and_derived_health_form_and_is_not_public():
    event = pub.new_event("p1", a_plan())
    assert event["planId"] == "p1" and event["planSegmentId"] == "s1"
    assert event["public"] is False and event["healthForm"] == "ab"
    assert event["signups"]["questions"] == [] and event["signups"]["audience"] == "both"
    assert "startTime" not in event  # no value, no field
    assert pub.event_id_for("p1", "s1") == "p1_s1"


def test_diff_shows_only_disagreements_and_marks_edits_made_on_the_event():
    plan = a_plan()
    event = pub.new_event("p1", plan)
    snap = pub.snapshot(event)
    assert pub.diff(plan, event, snap) == []
    edited = {**event, "place": "Cedar Ridge", "signups": {**event["signups"], "questions": [{"id": "q1"}]}}
    changes = pub.diff(plan, edited, snap)
    assert [c["field"] for c in changes] == ["place"]  # the event's own questions are not the plan's business
    assert changes[0]["editedOnEvent"] is True
    assert pub.drift(edited, snap) == ["place"]


def test_republish_writes_only_ticked_fields_and_keeps_the_events_questions():
    plan = a_plan(place="New Lake", feeCents=3000)
    live = {**pub.new_event("p1", a_plan()), "signups": {"enabled": True, "questions": [{"id": "q1"}], "capacity": 5}}
    update = pub.update_for(plan, live, ["place", "signups", "bogus"])
    assert update["place"] == "New Lake"
    assert update["signups"]["questions"] == [{"id": "q1"}] and update["signups"]["capacity"] == 20
    assert "feeCents" not in update
    off = pub.update_for(a_plan(signups={"enabled": False}), live, ["signups"])
    assert off["signups"]["enabled"] is False and off["signups"]["questions"] == [{"id": "q1"}]
    cleared = pub.update_for(a_plan(place=""), live, ["place"])
    assert cleared == {"place": None}


def test_core_from_event_round_trips_through_the_checks():
    event = {"title": "Klondike", "start": "2027-01-20", "logKind": "campout", "healthForm": "abc", "feeCents": 1500}
    plan = core.core(pub.core_from_event(event))
    assert plan["kind"] == "campout" and plan["segments"][0]["partC"] is True
    assert pub.diff(plan, {**pub.new_event("p", plan)}, None) == []


def test_availability_must_be_held_or_booked_and_recent():
    held = {"name": "Pine Lake", "availability": {"state": "held", "at": NOW - timedelta(days=3)}}
    assert pub.availability_problem(held, NOW) is None
    assert pub.availability_problem(None, NOW) is None
    stale = {"name": "Pine Lake", "availability": {"state": "booked", "at": NOW - timedelta(days=31)}}
    assert "more than 30 days" in pub.availability_problem(stale, NOW)
    maybe = {"name": "Pine Lake", "availability": {"state": "available", "at": NOW}}
    assert "not marked as held or booked" in pub.availability_problem(maybe, NOW)


# --- forgetting an adult who deletes their account ---


def test_an_adult_is_taken_off_a_plan_and_their_records_become_former_member():
    plan = {
        "staffing": {
            "adultMemberIds": ["a1", "a2"],
            "drivers": [{"memberId": "a1", "seats": 4}],
            "transport": "carpool",
        },
        "tripLeadMemberId": "a1",
        "tripLeadUid": "u1",
        "decision": {"byMemberId": "a1", "optionId": "o1"},
        "createdByMemberId": "a2",
    }
    update = plan_update(plan, "a1")
    assert update["staffing"]["adultMemberIds"] == ["a2"] and update["staffing"]["drivers"] == []
    assert update["staffing"]["transport"] == "carpool"
    assert (update["tripLeadMemberId"], update["tripLeadUid"]) == (None, None)
    assert update["decision"] == {"byMemberId": None, "optionId": "o1"}
    assert "createdByMemberId" not in update
    assert plan_update(plan, "zz") is None
    option = {"createdByMemberId": "a1", "availability": {"state": "held", "byMemberId": "a1"}}
    assert record_update(option, "a1") == {
        "createdByMemberId": None,
        "availability": {"state": "held", "byMemberId": None},
    }
    assert record_update({"done": {"byMemberId": "a1"}}, "a1") == {"done": {"byMemberId": None}}
    assert record_update({"byMemberId": "a2"}, "a1") is None
