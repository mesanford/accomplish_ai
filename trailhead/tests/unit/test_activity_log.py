from datetime import date

import pytest

from handlers.activity_log import (
    credit_inputs_changed,
    delete_blocker,
    event_credit,
    event_log_doc,
    manual_entry_doc,
    may_add_for,
    parse_manual_entry,
    plan_event_logs,
    review_blocker,
    scout_log_change,
)
from handlers.attendance import attendance_effects
from handlers.membership import InvalidInput

TODAY = date(2026, 10, 17)
CAMPOUT = {"title": "October campout", "start": "2026-10-10", "logKind": "campout", "logValues": {"nights": 2}}


def test_event_credit_counts_nights_hours_and_miles():
    event = {"logKind": "hike", "logValues": {"nights": 1, "serviceHours": 2.5, "miles": 12}}
    assert event_credit(event) == {"kind": "hike", "nights": 1, "serviceHours": 2.5, "miles": 12.0}


def test_event_with_no_amounts_credits_nothing():
    assert event_credit({"logKind": "campout"}) is None
    assert event_credit({"logValues": {"nights": 0, "miles": 0, "serviceHours": 0}}) is None
    assert event_credit(None) is None


def test_bad_amounts_count_as_zero_and_big_ones_are_capped():
    assert event_credit({"logValues": {"nights": "3", "miles": -4, "serviceHours": True}}) is None
    assert event_credit({"logValues": {"nights": 500}})["nights"] == 60
    assert event_credit({"logValues": {"nights": 2.9}})["nights"] == 2


def test_kind_defaults_from_the_amounts_when_the_event_has_none():
    assert event_credit({"logValues": {"nights": 1}})["kind"] == "campout"
    assert event_credit({"logValues": {"serviceHours": 3}})["kind"] == "service"
    assert event_credit({"logValues": {"miles": 3}, "logKind": "bogus"})["kind"] == "hike"


def test_event_log_document_is_complete():
    doc = event_log_doc("e1", CAMPOUT, "s1")
    assert doc == {
        "scoutId": "s1",
        "eventId": "e1",
        "eventTitle": "October campout",
        "date": "2026-10-10",
        "source": "event",
        "status": "approved",
        "kind": "campout",
        "nights": 2,
        "serviceHours": 0,
        "miles": 0,
    }


def test_attendance_effects_uses_the_same_document():
    fx = attendance_effects("e1", CAMPOUT, {"id": "s1", "kind": "scout"}, True)
    assert fx.log == event_log_doc("e1", CAMPOUT, "s1")


def test_a_present_scout_is_set_once_and_then_left_alone():
    first = scout_log_change("e1", CAMPOUT, "s1", True, None)
    assert first == ("set", event_log_doc("e1", CAMPOUT, "s1"))
    assert scout_log_change("e1", CAMPOUT, "s1", True, first[1]) is None  # running it again changes nothing


def test_unticking_attendance_deletes_the_credit():
    existing = event_log_doc("e1", CAMPOUT, "s1")
    assert scout_log_change("e1", CAMPOUT, "s1", False, existing) == ("delete", None)
    assert scout_log_change("e1", CAMPOUT, "s1", False, None) is None


def test_clearing_the_event_amounts_deletes_credits():
    existing = event_log_doc("e1", CAMPOUT, "s1")
    assert scout_log_change("e1", {**CAMPOUT, "logValues": {}}, "s1", True, existing) == ("delete", None)


def test_event_change_recomputes_every_present_scout():
    existing = {f"e1_{s}": event_log_doc("e1", CAMPOUT, s) for s in ("s1", "s2")}
    changed = {**CAMPOUT, "logValues": {"nights": 3}, "title": "Fall campout"}
    plan = plan_event_logs("e1", changed, {"s1", "s2"}, existing)
    assert set(plan.sets) == {"e1_s1", "e1_s2"} and plan.deletes == []
    assert plan.sets["e1_s1"]["nights"] == 3 and plan.sets["e1_s1"]["eventTitle"] == "Fall campout"


def test_recompute_is_idempotent_and_drops_scouts_no_longer_present():
    existing = {f"e1_{s}": event_log_doc("e1", CAMPOUT, s) for s in ("s1", "s2")}
    same = plan_event_logs("e1", CAMPOUT, {"s1", "s2"}, existing)
    assert same.sets == {} and same.deletes == []
    plan = plan_event_logs("e1", CAMPOUT, {"s1", "s3"}, existing)
    assert set(plan.sets) == {"e1_s3"} and plan.deletes == ["e1_s2"]


def test_a_deleted_event_removes_all_its_credits():
    existing = {f"e1_{s}": event_log_doc("e1", CAMPOUT, s) for s in ("s1", "s2")}
    plan = plan_event_logs("e1", None, {"s1"}, existing)
    assert plan.sets == {} and sorted(plan.deletes) == ["e1_s1", "e1_s2"]


def test_only_credit_fields_trigger_a_recompute():
    assert not credit_inputs_changed(CAMPOUT, {**CAMPOUT, "place": "Camp Lowden"})
    assert credit_inputs_changed(CAMPOUT, {**CAMPOUT, "logKind": "service"})
    assert credit_inputs_changed(CAMPOUT, {**CAMPOUT, "start": "2026-10-11"})
    assert credit_inputs_changed(None, CAMPOUT)


GOOD = {"kind": "service", "date": "2026-09-01", "serviceHours": 40, "note": "Eagle project: trail bridge"}


def test_manual_entry_is_cleaned():
    entry = parse_manual_entry({**GOOD, "note": "  Eagle   project  ", "eagleProject": True}, TODAY)
    assert entry == {
        "kind": "service",
        "date": "2026-09-01",
        "note": "Eagle project",
        "nights": 0,
        "serviceHours": 40.0,
        "miles": 0,
        "eagleProject": True,
    }
    assert "eagleProject" not in parse_manual_entry({**GOOD, "eagleProject": "yes"}, TODAY)


@pytest.mark.parametrize(
    "change, message",
    [
        ({"kind": "party"}, "Pick campout"),
        ({"note": "  "}, "short note"),
        ({"note": "x" * 201}, "200 characters"),
        ({"serviceHours": 0}, "at least one night"),
        ({"date": "yesterday"}, "YYYY-MM-DD"),
        ({"date": "2026-10-18"}, "future"),
        ({"date": "2001-01-01"}, "too long ago"),
    ],
)
def test_bad_manual_entries_are_refused(change, message):
    with pytest.raises(InvalidInput, match=message):
        parse_manual_entry({**GOOD, **change}, TODAY)


def test_who_may_add_and_whether_it_waits():
    parent = {"roles": ["parent"], "scoutIds": ["s1"], "consentPendingScoutIds": ["s3"]}
    assert may_add_for({}, "s9", leader=True)
    assert may_add_for(parent, "s1", leader=False)
    assert not may_add_for(parent, "s2", leader=False)
    assert not may_add_for(parent, "s3", leader=False)  # has not agreed to the notice for this Scout yet
    entry = parse_manual_entry(GOOD, TODAY)
    assert manual_entry_doc(entry, "s1", "m1", "Pat", leader=True)["status"] == "approved"
    waiting = manual_entry_doc(entry, "s1", "m1", "Pat", leader=False)
    assert waiting["status"] == "pending" and waiting["source"] == "manual" and waiting["scoutId"] == "s1"


def test_review_and_delete_rules():
    pending = {"source": "manual", "status": "pending"}
    assert review_blocker(pending, "approve") is None and review_blocker(pending, "reject") is None
    assert review_blocker(pending, "maybe")
    assert review_blocker({"source": "manual", "status": "approved"}, "approve")
    assert review_blocker({"source": "event", "status": "approved"}, "approve")
    assert review_blocker(None, "approve")
    assert delete_blocker(pending, leader=False) is None
    assert delete_blocker({"source": "manual", "status": "approved"}, leader=False)
    assert delete_blocker({"source": "manual", "status": "approved"}, leader=True) is None
    assert delete_blocker({"source": "event", "status": "approved"}, leader=True)
