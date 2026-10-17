"""Scout account math: balances and open charges from entries, charges, payments and reversals."""

from datetime import date

import pytest

from handlers.ledger import (
    MAX_CENTS,
    account_doc,
    allocate,
    already_charged,
    charge_entry,
    charge_from_credit,
    compute_account,
    parse_cents,
    parse_day,
    parse_text,
    payment_entry,
    reversal_entry,
)
from handlers.membership import InvalidInput

S = "s1"


def sale(cents):
    return {"scoutId": S, "type": "sale", "amountCents": cents, "description": "Popcorn"}


def charge(cents, from_credit=False, **extra):
    return {**charge_entry(S, cents, "Campout", from_credit, None), **extra}


def test_empty_account_is_zero():
    state = compute_account({})
    assert (state.balance, state.open_cents, state.net) == (0, 0, 0)


def test_sales_add_credit_and_a_charge_from_credit_lowers_it():
    state = compute_account({"a": sale(5000), "b": charge(3500, from_credit=True)})
    assert state.balance == 1500
    assert state.open_cents == 0


def test_an_open_charge_is_owed_and_does_not_touch_the_balance():
    state = compute_account({"a": sale(1000), "c": charge(3500)})
    assert state.balance == 1000
    assert state.open_cents == 3500
    assert state.owed == {"c": 3500}
    assert state.net == -2500  # balance minus open charges


def test_a_cash_payment_covers_an_open_charge():
    entries = {"c": charge(3500), "p": {"scoutId": S, "type": "payment", "amountCents": 3500, "covers": {"c": 3500}}}
    state = compute_account(entries)
    assert (state.balance, state.open_cents) == (0, 0)


def test_part_payment_leaves_the_rest_open_and_extra_becomes_credit():
    entries = {
        "c": charge(3500),
        "p": {"scoutId": S, "type": "payment", "amountCents": 5000, "covers": {"c": 2000}},
    }
    state = compute_account(entries)
    assert state.owed == {"c": 1500}
    assert state.balance == 3000


def test_paying_from_credit_moves_credit_onto_the_charge():
    entries = {
        "a": sale(4000),
        "c": charge(3500),
        "p": {"scoutId": S, "type": "payment", "method": "credit", "amountCents": 0, "covers": {"c": 3500}},
    }
    state = compute_account(entries)
    assert (state.balance, state.open_cents) == (500, 0)


def test_charge_from_credit_only_where_there_is_enough_unless_negative_is_allowed():
    rich, poor = compute_account({"a": sale(5000)}), compute_account({"a": sale(1000)})
    assert charge_from_credit(rich, 3500, "credit", False) is True
    assert charge_from_credit(poor, 3500, "credit", False) is False
    assert charge_from_credit(poor, 3500, "credit", True) is True
    assert charge_from_credit(rich, 3500, "open", True) is False
    with pytest.raises(InvalidInput):
        charge_from_credit(rich, 3500, "cash", False)


def test_allowing_negative_lets_the_balance_go_below_zero():
    state = compute_account({"a": sale(1000), "b": charge(3500, from_credit=True)})
    assert state.balance == -2500
    assert state.open_cents == 0


def test_reversing_a_sale_takes_the_credit_back_with_a_reason():
    entries = {"a": sale(4000)}
    rev = reversal_entry(entries, "a", "Entered $40, sale was $14")
    assert rev["amountCents"] == -4000 and rev["reverses"] == "a" and rev["type"] == "adjustment"
    assert rev["reason"] == "Entered $40, sale was $14"
    assert compute_account({**entries, "r": rev}).balance == 0


def test_reversing_an_open_charge_closes_it():
    entries = {"c": charge(3500)}
    rev = reversal_entry(entries, "c", "Did not attend")
    state = compute_account({**entries, "r": rev})
    assert (state.balance, state.open_cents) == (0, 0)


def test_reversing_a_charge_a_family_paid_turns_their_payment_into_credit():
    entries = {"c": charge(3500), "p": {"scoutId": S, "type": "payment", "amountCents": 2000, "covers": {"c": 2000}}}
    state = compute_account({**entries, "r": reversal_entry(entries, "c", "Cancelled")})
    assert (state.balance, state.open_cents) == (2000, 0)


def test_reversing_a_payment_reopens_the_charge():
    entries = {"c": charge(3500), "p": {"scoutId": S, "type": "payment", "amountCents": 3500, "covers": {"c": 3500}}}
    state = compute_account({**entries, "r": reversal_entry(entries, "p", "Check bounced")})
    assert (state.balance, state.open_cents) == (0, 3500)


def test_reversal_needs_a_reason_and_happens_once():
    entries = {"a": sale(4000)}
    with pytest.raises(InvalidInput, match="reason"):
        reversal_entry(entries, "a", "  ")
    rev = reversal_entry(entries, "a", "Typo")
    with pytest.raises(InvalidInput, match="already"):
        reversal_entry({**entries, "r": rev}, "a", "Again")
    with pytest.raises(InvalidInput, match="can't be reversed"):
        reversal_entry({**entries, "r": rev}, "r", "Undo")
    with pytest.raises(InvalidInput, match="isn't on this account"):
        reversal_entry(entries, "missing", "Typo")


def test_transfers_are_not_reversed_here():
    entries = {"t": {"scoutId": S, "type": "transfer", "amountCents": -500, "transferId": "x"}}
    with pytest.raises(InvalidInput, match="transfer"):
        reversal_entry(entries, "t", "Wrong sibling")


def test_payment_entry_allocates_in_order_and_keeps_the_rest_as_credit():
    state = compute_account({"c1": charge(1000), "c2": charge(3000)})
    entry = payment_entry(state, S, {"method": "check", "amountCents": 2500, "chargeIds": ["c1", "c2"]}, False)
    assert entry["covers"] == {"c1": 1000, "c2": 1500}
    assert entry["amountCents"] == 2500
    assert entry["description"] == "Check payment"


def test_payment_from_credit_must_match_charges_and_fit_the_balance():
    state = compute_account({"a": sale(1000), "c": charge(3500)})
    with pytest.raises(InvalidInput, match="enough account credit"):
        payment_entry(state, S, {"method": "credit", "amountCents": 3500, "chargeIds": ["c"]}, False)
    with pytest.raises(InvalidInput, match="only pay open charges"):
        payment_entry(state, S, {"method": "credit", "amountCents": 500, "chargeIds": []}, False)
    entry = payment_entry(state, S, {"method": "credit", "amountCents": 1000, "chargeIds": ["c"]}, False)
    assert entry["amountCents"] == 0 and entry["appliedCents"] == 1000
    assert payment_entry(state, S, {"method": "credit", "amountCents": 3500, "chargeIds": ["c"]}, True)["covers"]


def test_payment_refuses_unknown_methods_and_closed_charges():
    state = compute_account({"c": charge(1000, from_credit=True)})
    with pytest.raises(InvalidInput, match="how the family paid"):
        payment_entry(state, S, {"method": "card", "amountCents": 100}, False)
    with pytest.raises(InvalidInput, match="not open"):
        allocate(state, 100, ["c"])


def test_amounts_are_whole_positive_cents_with_a_ceiling():
    assert parse_cents(1250) == 1250
    for bad in (0, -5, 12.5, "1250", True, None, MAX_CENTS + 1):
        with pytest.raises(InvalidInput):
            parse_cents(bad)
    assert parse_cents(0, allow_zero=True) == 0


def test_text_is_trimmed_and_required():
    assert parse_text("  Fall   campout ", "Description", 120) == "Fall campout"
    with pytest.raises(InvalidInput):
        parse_text("", "Description", 120)
    with pytest.raises(InvalidInput):
        parse_text("x" * 121, "Description", 120)


def test_entry_date_defaults_to_today_and_is_never_in_the_future():
    today = date(2026, 10, 16)
    assert parse_day(None, today) == today
    assert parse_day("2026-10-01", today) == date(2026, 10, 1)
    for bad in ("2026-10-17", "2025-01-01", "not a date"):
        with pytest.raises(InvalidInput):
            parse_day(bad, today)


def test_already_charged_matches_event_and_description_unless_reversed():
    entries = {"c": {**charge_entry(S, 3500, "Fall campout", False, "e1")}}
    assert already_charged(entries, "e1", "Fall campout")
    assert not already_charged(entries, "e1", "Camp food")
    assert not already_charged(entries, "e2", "Fall campout")
    rev = reversal_entry(entries, "c", "Charged in error")
    assert not already_charged({**entries, "r": rev}, "e1", "Fall campout")


def test_account_doc_caches_the_computed_totals():
    state = compute_account({"a": sale(1000), "c": charge(3500)})
    assert account_doc(S, state, 2) == {
        "scoutId": S,
        "balanceCents": 1000,
        "openChargesCents": 3500,
        "openChargeCount": 1,
        "entryCount": 2,
    }
