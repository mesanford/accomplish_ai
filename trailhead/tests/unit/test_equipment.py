"""Equipment rules: quantity math, check-out terms, overdue dates, the quartermaster role and history retention."""

from datetime import UTC, date, datetime

import pytest

from handlers.account import BADGE_MANAGER_ROLES, LEADER_ROLES
from handlers.equipment import (
    available,
    can_manage,
    check_out_blocker,
    days_overdue,
    default_due,
    history_due,
    is_overdue,
    parse_check_in,
    parse_checkout,
    parse_quantity,
    parse_request,
)
from handlers.membership import ROLES, YPT_ROLES, InvalidInput
from handlers.roles import ADULT_ROLES, parse_roles

TODAY = date(2026, 10, 17)


def test_available_is_quantity_less_what_is_out():
    assert available({"quantity": 12, "out": 5}) == 7
    assert available({"quantity": 12}) == 12  # `out` is missing until the first loan
    assert available({"quantity": 3, "out": 9}) == 0  # never negative


def test_cannot_check_out_more_than_is_on_the_shelf():
    mess_kits = {"name": "Mess kit", "quantity": 12, "out": 10, "condition": "good"}
    assert check_out_blocker(mess_kits, 2) is None
    assert check_out_blocker(mess_kits, 3) == "Only 2 on the shelf. Check out 2 or fewer."
    assert check_out_blocker({**mess_kits, "out": 12}, 1) == "None of that item is on the shelf."


def test_a_single_tracked_item_goes_out_once():
    tent = {"name": "Tent 4", "tag": "T-4", "quantity": 1, "out": 0, "condition": "good"}
    assert check_out_blocker(tent, 1) is None
    assert check_out_blocker({**tent, "out": 1}, 1) is not None


def test_a_retired_or_missing_item_cannot_go_out():
    assert "retired" in check_out_blocker({"quantity": 1, "condition": "retired"}, 1)
    assert check_out_blocker(None, 1) == "That item isn't in the inventory."


def test_a_needs_repair_item_can_still_go_out():
    assert check_out_blocker({"quantity": 1, "condition": "needs_repair"}, 1) is None


@pytest.mark.parametrize("bad", [0, -1, 1001, 1.5, "3", None, True])
def test_quantity_must_be_a_whole_number_from_1_to_1000(bad):
    with pytest.raises(InvalidInput):
        parse_quantity(bad)


def test_checkout_terms_name_one_recipient_and_a_future_due_date():
    base = {"quantity": 2, "dueDate": "2026-10-24"}
    loan = parse_checkout({**base, "memberId": "s1", "note": " for the hike "}, TODAY)
    assert loan == {"quantity": 2, "toKind": "member", "toId": "s1", "dueDate": "2026-10-24", "note": "for the hike"}
    assert parse_checkout({**base, "eventId": "e1"}, TODAY)["toKind"] == "event"
    for wrong in ({}, {"memberId": "s1", "eventId": "e1"}):
        with pytest.raises(InvalidInput):
            parse_checkout({**base, **wrong}, TODAY)
    with pytest.raises(InvalidInput):
        parse_checkout({"memberId": "s1", "quantity": 1, "dueDate": "2026-10-16"}, TODAY)
    with pytest.raises(InvalidInput):
        parse_checkout({"memberId": "s1", "quantity": 1, "dueDate": "soon"}, TODAY)


def test_due_today_is_not_overdue_but_yesterday_is():
    out = {"status": "out", "dueDate": "2026-10-17"}
    assert not is_overdue(out, TODAY)
    assert is_overdue({**out, "dueDate": "2026-10-16"}, TODAY)
    assert days_overdue({**out, "dueDate": "2026-10-10"}, TODAY) == 7
    assert days_overdue(out, TODAY) == 0


def test_a_returned_loan_or_one_without_a_date_is_never_overdue():
    assert not is_overdue({"status": "returned", "dueDate": "2020-01-01"}, TODAY)
    assert not is_overdue({"status": "out"}, TODAY)
    assert not is_overdue({"status": "out", "dueDate": "garbage"}, TODAY)


def test_an_event_loan_is_due_the_day_after_the_event_unless_that_has_passed():
    assert default_due({"start": "2026-11-06", "endDate": "2026-11-08"}, TODAY) == "2026-11-09"
    assert default_due({"start": "2026-11-06"}, TODAY) == "2026-11-07"
    assert default_due({"start": "2026-01-01"}, TODAY) == "2026-10-17"


def test_check_in_condition_defaults_to_good_and_must_be_known():
    assert parse_check_in({}) == ("good", "")
    assert parse_check_in({"condition": "needs_repair", "note": "Torn flap"}) == ("needs_repair", "Torn flap")
    with pytest.raises(InvalidInput):
        parse_check_in({"condition": "broken"})


def test_a_request_needs_a_quantity_and_trims_the_note():
    assert parse_request({"eventId": "e1", "note": "  two please "}) == {
        "quantity": 1,
        "eventId": "e1",
        "note": "two please",
    }


def test_quartermaster_is_a_role_and_grants_only_gear_management():
    assert "quartermaster" in ROLES and "quartermaster" in ADULT_ROLES
    assert parse_roles(["quartermaster", "parent"]) == ["quartermaster", "parent"]
    assert can_manage({"roles": ["quartermaster"]})
    assert can_manage({"roles": ["advancement"]})
    assert can_manage({"roles": ["scout", "quartermaster"]})
    for role in ("counselor", "committee", "treasurer", "parent", "scout"):
        assert not can_manage({"roles": [role]})
    assert "quartermaster" not in LEADER_ROLES and "quartermaster" not in BADGE_MANAGER_ROLES
    assert "quartermaster" not in YPT_ROLES  # needs no Youth Protection date


def test_history_is_due_seven_years_after_it_closed():
    closed = datetime(2019, 10, 17, 12, tzinfo=UTC)
    assert not history_due(closed, date(2026, 10, 16))
    assert history_due(closed, date(2026, 10, 17))
    assert not history_due(None, date(2040, 1, 1))  # an unknown date is kept
