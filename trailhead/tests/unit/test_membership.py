from datetime import UTC, date, datetime, timedelta

import pytest

from handlers.membership import InvalidInput, check_invite, new_invite, new_scout, new_troop, parse_ypt, under_13

TODAY = date(2026, 10, 13)
NOW = datetime(2026, 10, 13, 12, tzinfo=UTC)


def test_new_troop_needs_name_number_and_training():
    data = {"name": "Troop 101", "unitNumber": "101", "displayName": "Pat", "yptExpiresAt": "2027-05-01"}
    troop, member = new_troop(data, "u1", TODAY)
    assert troop["name"] == "Troop 101"
    assert member["roles"] == ["leader"]
    assert member["yptExpiresAt"].date() == date(2027, 5, 1)
    with pytest.raises(InvalidInput, match="Youth Protection"):
        new_troop({**data, "yptExpiresAt": ""}, "u1", TODAY)
    with pytest.raises(InvalidInput, match="Unit number"):
        new_troop({**data, "unitNumber": ""}, "u1", TODAY)


def test_expired_training_is_refused_for_leaders_but_optional_for_parents():
    with pytest.raises(InvalidInput, match="expired"):
        parse_ypt("2026-01-01", ["leader"], TODAY)
    assert parse_ypt("", ["parent"], TODAY) is None


def test_parent_invite_must_name_existing_scouts():
    with pytest.raises(InvalidInput):
        new_invite({"role": "parent", "scoutIds": ["nope"]}, {"s1"}, set(), NOW)
    invite = new_invite({"role": "parent", "scoutIds": ["s1", "s1"]}, {"s1"}, set(), NOW)
    assert invite["scoutIds"] == ["s1"]
    assert invite["expiresAt"] == NOW + timedelta(30)


def test_scout_invite_needs_an_unlinked_scout():
    with pytest.raises(InvalidInput):
        new_invite({"role": "scout", "scoutMemberId": "s1"}, {"s1"}, set(), NOW)
    assert new_invite({"role": "scout", "scoutMemberId": "s1"}, {"s1"}, {"s1"}, NOW)["scoutMemberId"] == "s1"


def test_used_or_expired_invites_are_refused():
    with pytest.raises(InvalidInput, match="already been used"):
        check_invite({"usedBy": "u2", "expiresAt": NOW}, NOW)
    with pytest.raises(InvalidInput, match="expired"):
        check_invite({"expiresAt": NOW - timedelta(1)}, NOW)
    with pytest.raises(InvalidInput, match="isn't valid"):
        check_invite(None, NOW)


def test_new_scout_checks_age_and_rank():
    member, record = new_scout(
        {"displayName": "Sam", "birthYear": 2013, "birthMonth": 4, "currentRankId": "tenderfoot"}, TODAY
    )
    assert member["kind"] == "scout"
    assert record["currentRankId"] == "tenderfoot"
    with pytest.raises(InvalidInput, match="10 to 17"):
        new_scout({"displayName": "Kid", "birthYear": 2020, "birthMonth": 1}, TODAY)
    with pytest.raises(InvalidInput, match="rank"):
        new_scout({"displayName": "Sam", "birthYear": 2013, "birthMonth": 4, "currentRankId": "wizard"}, TODAY)


def test_under_13_assumes_the_latest_birthday():
    assert under_13({"birthYear": 2013, "birthMonth": 10}, TODAY)  # turns 13 sometime this month
    assert not under_13({"birthYear": 2013, "birthMonth": 9}, TODAY)
