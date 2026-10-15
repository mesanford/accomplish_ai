from datetime import UTC, date, datetime

import pytest

from handlers.consent import (
    CONSENT_NOTICE_VERSION,
    check_leader_confirmation,
    check_parent_consent,
    leader_confirmation_entry,
    parent_consent_entry,
)
from handlers.membership import InvalidInput

TODAY = date(2026, 10, 14)
NOW = datetime(2026, 10, 14, 12, tzinfo=UTC)
YOUNG = {"birthYear": 2015, "birthMonth": 3}
TEEN = {"birthYear": 2011, "birthMonth": 3}


def test_parent_must_tick_the_box_for_the_current_notice():
    check_parent_consent({"consent": True, "consentVersion": CONSENT_NOTICE_VERSION})
    for data in ({}, {"consent": False, "consentVersion": CONSENT_NOTICE_VERSION}, {"consent": "yes"}):
        with pytest.raises(InvalidInput, match="tick the box"):
            check_parent_consent(data)
    with pytest.raises(InvalidInput, match="notice has changed"):
        check_parent_consent({"consent": True, "consentVersion": "2020-01-01"})
    with pytest.raises(InvalidInput, match="notice has changed"):
        check_parent_consent({"consent": True})


def test_consent_records_who_when_and_which_version():
    entry = parent_consent_entry("u1", "m1", NOW)
    assert entry == {"uid": "u1", "memberId": "m1", "at": NOW, "version": CONSENT_NOTICE_VERSION}
    assert leader_confirmation_entry("u2", "m2", NOW) == {"uid": "u2", "memberId": "m2", "at": NOW}


def test_leader_must_confirm_only_when_the_scout_may_be_under_13():
    with pytest.raises(InvalidInput, match="permission"):
        check_leader_confirmation({}, YOUNG, TODAY)
    with pytest.raises(InvalidInput, match="permission"):
        check_leader_confirmation({"leaderConfirmed": "true"}, YOUNG, TODAY)
    assert check_leader_confirmation({"leaderConfirmed": True}, YOUNG, TODAY) is True
    assert check_leader_confirmation({}, TEEN, TODAY) is False
