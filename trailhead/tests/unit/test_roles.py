from datetime import UTC, date, datetime

import pytest

from handlers.membership import InvalidInput
from handlers.messaging import pending_links, people_from_members
from handlers.removal import plan_access
from handlers.roles import (
    acts_for,
    decline_result,
    in_order,
    loses_all_leaders,
    new_links,
    parse_roles,
    pending_ids,
    ypt_blocker,
)
from trailhead_core import plan_delivery

TODAY = date(2026, 10, 15)


def test_roles_are_kept_in_the_apps_order_without_repeats():
    assert in_order(["parent", "leader", "parent"]) == ["leader", "parent"]
    assert parse_roles(["committee", "leader"]) == ["leader", "committee"]


@pytest.mark.parametrize("bad", [None, [], "leader", ["scout"], ["boss"], [1]])
def test_a_leader_picks_at_least_one_adult_role(bad):
    with pytest.raises(InvalidInput):
        parse_roles(bad)


def test_new_training_roles_need_a_current_date():
    soon = datetime(2027, 1, 1, tzinfo=UTC)
    assert ypt_blocker({"leader"}, soon, "Pat", TODAY) is None
    assert ypt_blocker({"parent"}, None, "Pat", TODAY) is None
    assert ypt_blocker(set(), None, "Pat", TODAY) is None
    assert "no Youth Protection training date" in ypt_blocker({"counselor"}, None, "Pat", TODAY)
    expired = ypt_blocker({"committee"}, datetime(2026, 1, 1, tzinfo=UTC), "Pat", TODAY)
    assert "expired" in expired and "Add a current date" in expired


def test_the_last_leader_cannot_lose_the_role():
    docs = {"a": {"roles": ["leader", "parent"]}, "b": {"roles": ["counselor"]}}
    assert loses_all_leaders("a", ["parent"], docs)
    assert not loses_all_leaders("a", ["leader"], docs)
    assert not loses_all_leaders("b", ["counselor", "parent"], docs)
    docs["b"]["roles"] = ["advancement"]  # an advancement chair counts as a leader
    assert not loses_all_leaders("a", ["parent"], docs)
    assert not loses_all_leaders("a", ["parent"], {"a": {"roles": ["parent"]}})  # nothing to lose


def test_links_pending_and_acting_for_a_scout():
    access = {"scoutIds": ["s1", "s2"], "consentPendingScoutIds": ["s2", "gone"]}
    assert new_links(access, ["s1", "s3", "s3"]) == ["s3"]
    assert pending_ids(access) == ["s2"]
    assert acts_for(access, "s1") and not acts_for(access, "s2") and not acts_for(access, "s9")


def test_declining_unlinks_the_pending_scouts_and_keeps_another_role():
    access = {"roles": ["counselor", "parent"], "scoutIds": ["s2"], "consentPendingScoutIds": ["s2"]}
    assert decline_result(access) == ([], ["counselor"])
    kept = {"roles": ["parent"], "scoutIds": ["s1", "s2"], "consentPendingScoutIds": ["s2"]}
    assert decline_result(kept) == (["s1"], ["parent"])
    only = {"roles": ["parent"], "scoutIds": ["s2"], "consentPendingScoutIds": ["s2"]}
    assert decline_result(only) == ([], ["parent"])  # never left with no role


def test_removing_a_scout_trims_a_parents_pending_list():
    plan = plan_access("s2", {"u": {"memberId": "m", "scoutIds": ["s1", "s2"], "consentPendingScoutIds": ["s2"]}})
    assert plan.new_scout_ids == {"u": ["s1"]} and plan.new_pending == {"u": []}


MEMBERS = {
    "lead": {"kind": "adult", "uid": "u1", "yptExpiresAt": datetime(2027, 1, 1, tzinfo=UTC), "guardianIds": []},
    "own": {"kind": "scout", "guardianIds": ["lead"]},
    "other": {"kind": "scout", "guardianIds": []},
}


def test_a_leader_who_is_a_parent_may_message_only_their_own_child_without_training():
    members = {**MEMBERS, "lead": {**MEMBERS["lead"], "yptExpiresAt": None}}
    people = people_from_members(members)
    plan_delivery(people["lead"], [people["own"]], people, [], TODAY, new_thread=True)
    with pytest.raises(Exception, match="Youth Protection"):
        plan_delivery(people["lead"], [people["own"], people["other"]], people, [], TODAY, new_thread=True)
    with pytest.raises(Exception, match="Youth Protection"):
        plan_delivery(people["lead"], [people["other"]], people, ["lead"], TODAY, new_thread=True)


def test_a_trained_leader_may_message_any_scout_when_a_second_adult_is_copied():
    people = people_from_members(MEMBERS)
    people["asm"] = people["lead"].__class__("asm", False, (), people["lead"].ypt_expires)
    delivery = plan_delivery(people["lead"], [people["other"]], people, ["asm"], TODAY, new_thread=True)
    assert delivery.added_ids == ["asm"]


def test_a_parent_who_has_not_agreed_is_not_copied_or_counted_as_family():
    pending = pending_links([{"memberId": "lead", "scoutIds": ["own"], "consentPendingScoutIds": ["own"]}])
    assert pending == {("lead", "own")}
    people = people_from_members(MEMBERS, pending)
    assert people["own"].guardian_ids == ()
    assert people_from_members(MEMBERS)["own"].guardian_ids == ("lead",)
