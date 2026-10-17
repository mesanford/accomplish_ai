import pytest

from handlers.announcement_audience import resolve
from handlers.announcements import parse_audience
from handlers.membership import InvalidInput
from handlers.patrols import check_officers, name_taken, parse_patrol, plan_assign, plan_delete, plan_erase

MEMBERS = {
    "s1": {"kind": "scout", "patrolId": "p1", "guardianIds": ["m1"], "displayName": "Sam Lee"},
    "s2": {"kind": "scout", "patrolId": "p1", "guardianIds": ["m2"], "displayName": "Riley"},
    "s3": {"kind": "scout", "displayName": "Ava"},
    "m1": {"kind": "adult"},
    "m2": {"kind": "adult"},
}
PATROLS = {"p1": {"name": "Eagles", "leaderId": "s1", "assistantId": "s2"}, "p2": {"name": "Owls"}}


def test_patrol_name_and_color_are_checked():
    assert parse_patrol({"name": "  Flaming   Arrows ", "color": "#AA3300"}) == {
        "name": "Flaming Arrows",
        "color": "#aa3300",
    }
    assert parse_patrol({"name": "Owls"})["color"] is None
    for bad in ({"name": ""}, {"name": "x" * 41}, {"name": "Owls", "color": "red"}, {"name": "Owls", "color": 5}):
        with pytest.raises(InvalidInput):
            parse_patrol(bad)


def test_names_must_be_different_ignoring_case():
    assert name_taken("eagles", None, PATROLS)
    assert not name_taken("eagles", "p1", PATROLS)  # renaming a patrol to itself is fine


def test_leader_and_assistant_must_be_different_scouts_in_the_patrol():
    check_officers("p1", "s1", "s2", MEMBERS)
    check_officers("p1", None, None, MEMBERS)
    with pytest.raises(InvalidInput, match="patrol leader must be a Scout in this patrol"):
        check_officers("p1", "s3", None, MEMBERS)
    with pytest.raises(InvalidInput, match="assistant"):
        check_officers("p1", None, "m1", MEMBERS)
    with pytest.raises(InvalidInput, match="different"):
        check_officers("p1", "s1", "s1", MEMBERS)


def test_a_scout_moves_to_one_patrol_and_stops_leading_the_old_one():
    plan = plan_assign(["s1", "s3"], "p2", MEMBERS, PATROLS)
    assert plan.member_patrol == {"s1": "p2", "s3": "p2"}
    assert plan.patrol_fields == {"p1": {"leaderId": None}}


def test_assigning_to_the_same_patrol_changes_nothing_and_none_removes():
    assert plan_assign(["s1"], "p1", MEMBERS, PATROLS).member_patrol == {}
    plan = plan_assign(["s2"], None, MEMBERS, PATROLS)
    assert plan.member_patrol == {"s2": None} and plan.patrol_fields == {"p1": {"assistantId": None}}


def test_assign_refuses_adults_unknown_patrols_and_empty_lists():
    with pytest.raises(InvalidInput, match="Only Scouts"):
        plan_assign(["m1"], "p1", MEMBERS, PATROLS)
    with pytest.raises(InvalidInput, match="not found"):
        plan_assign(["s3"], "nope", MEMBERS, PATROLS)
    with pytest.raises(InvalidInput):
        plan_assign([], "p1", MEMBERS, PATROLS)


def test_deleting_a_patrol_unassigns_its_scouts():
    assert plan_delete("p1", MEMBERS) == ["s1", "s2"]
    assert plan_delete("p2", MEMBERS) == []


def test_erasing_a_scout_clears_their_patrol_offices():
    assert plan_erase("s1", PATROLS) == {"p1": {"leaderId": None}}
    assert plan_erase("s3", PATROLS) == {}


ACCESS = {
    "mom1": {"memberId": "m1", "roles": ["parent"], "scoutIds": ["s1"]},
    "mom2": {"memberId": "m2", "roles": ["parent"], "scoutIds": ["s2"], "consentPendingScoutIds": ["s2"]},
}


def test_parents_of_a_patrol_audience():
    assert parse_audience({"type": "patrolParents", "patrolId": "p1"}) == {"type": "patrolParents", "patrolId": "p1"}
    for bad in ({"type": "patrolParents"}, {"type": "patrolParents", "patrolId": 4}):
        with pytest.raises(InvalidInput, match="patrol"):
            parse_audience(bad)
    # Everyone's guardians are found; a parent who has not agreed to the notice for a Scout is left out.
    audience = resolve({"type": "patrolParents", "patrolId": "p1"}, MEMBERS, ACCESS, patrol_name="Eagles")
    assert audience.uids == ["mom1"] and audience.label == "Parents of Eagles"
    assert resolve({"type": "patrolParents", "patrolId": "p2"}, MEMBERS, ACCESS).uids == []
