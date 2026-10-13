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
PEOPLE = {p.id: p for p in [leader, asm, expired, parent, scout, orphan]}


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
