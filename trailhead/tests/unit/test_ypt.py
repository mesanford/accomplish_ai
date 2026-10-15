from datetime import date

import pytest

from trailhead_core.ypt import Person, YPTViolation, plan_delivery

TODAY = date(2026, 10, 13)
TRAINED = date(2027, 6, 1)

leader = Person("leader", is_youth=False, ypt_expires=TRAINED)
asm = Person("asm", is_youth=False, ypt_expires=TRAINED)
expired = Person("expired", is_youth=False, ypt_expires=date(2026, 1, 1))
parent = Person("parent", is_youth=False)
scout = Person("scout", is_youth=True, guardian_ids=("parent",))
orphan = Person("orphan", is_youth=True)  # no parent on the app
parent2 = Person("parent2", is_youth=False)
scout2 = Person("scout2", is_youth=True, guardian_ids=("parent2",))
PEOPLE = {p.id: p for p in [leader, asm, expired, parent, scout, orphan, scout2, parent2]}


def test_adult_to_scout_copies_parent():
    d = plan_delivery(leader, [scout], PEOPLE, ["asm"], TODAY)
    assert d.recipient_ids == ["scout", "parent"]
    assert d.added_ids == ["parent"]


def test_scout_to_adult_copies_parent():
    d = plan_delivery(scout, [leader], PEOPLE, ["asm"], TODAY)
    assert set(d.recipient_ids) == {"leader", "parent"}


def test_scout_without_parent_gets_second_adult():
    d = plan_delivery(leader, [orphan], PEOPLE, ["leader", "asm"], TODAY)
    assert d.added_ids == ["asm"]


def test_no_second_adult_available_refuses():
    with pytest.raises(YPTViolation):
        plan_delivery(leader, [orphan], PEOPLE, ["leader"], TODAY)


def test_expired_training_refuses():
    with pytest.raises(YPTViolation):
        plan_delivery(expired, [scout], PEOPLE, ["asm"], TODAY)


def test_two_adults_already_present_need_no_extra():
    d = plan_delivery(leader, [asm, orphan], PEOPLE, [], TODAY)
    assert d.added_ids == []


def test_adults_only_is_unchanged():
    d = plan_delivery(leader, [asm, parent], PEOPLE, [], TODAY)
    assert d.recipient_ids == ["asm", "parent"]


def test_parent_with_own_child_needs_no_training():
    d = plan_delivery(parent, [leader, scout], PEOPLE, [], TODAY)
    assert set(d.recipient_ids) == {"leader", "scout"}


def test_parent_messaging_another_scout_needs_training():
    with pytest.raises(YPTViolation) as err:
        plan_delivery(parent, [leader, orphan], PEOPLE, ["asm"], TODAY)
    assert err.value.person_id == "parent"


def test_scout_to_scout_refused():
    with pytest.raises(YPTViolation, match="not other Scouts"):
        plan_delivery(scout, [scout2], PEOPLE, ["asm"], TODAY, new_thread=True)


def test_scout_cannot_start_with_adult_plus_another_scout():
    with pytest.raises(YPTViolation, match="not other Scouts"):
        plan_delivery(scout, [leader, scout2], PEOPLE, ["asm"], TODAY, new_thread=True)


def test_youth_only_thread_reply_refused():
    with pytest.raises(YPTViolation, match="needs an adult"):
        plan_delivery(scout, [scout2], PEOPLE, ["asm"], TODAY)


def test_scout_starts_with_adult_and_copies_parent():
    d = plan_delivery(scout, [leader], PEOPLE, ["asm"], TODAY, new_thread=True)
    assert set(d.recipient_ids) == {"leader", "parent"}


def test_adult_to_several_scouts_copies_each_scouts_adult():
    d = plan_delivery(leader, [scout, scout2, orphan], PEOPLE, ["asm"], TODAY)
    assert set(d.added_ids) == {"parent", "parent2", "asm"}


def test_scout_replies_in_adult_group_with_other_scouts():
    d = plan_delivery(scout, [leader, scout2], PEOPLE, ["asm"], TODAY)
    assert {"leader", "scout2", "parent", "parent2"} <= set(d.recipient_ids)
