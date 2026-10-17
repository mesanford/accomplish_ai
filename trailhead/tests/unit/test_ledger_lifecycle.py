"""Settling a Scout's account when they leave, anonymizing on removal, and the 7-year retention rule."""

from datetime import date

import pytest

from handlers.ledger import GENERAL_FUND, compute_account
from handlers.ledger_lifecycle import (
    anonymized,
    entry_due,
    former_id,
    is_former,
    ledger_cutoff,
    plan_purge,
    scrub,
    settlement_entries,
)
from handlers.membership import InvalidInput

S = "s1"
TODAY = date(2033, 10, 16)


def state_with(balance=0, open_cents=0):
    entries = {"a": {"scoutId": S, "type": "sale", "amountCents": balance}}
    if open_cents:
        entries["c"] = {"scoutId": S, "type": "charge", "amountCents": -open_cents, "fromCredit": False}
    return compute_account(entries)


def test_leaving_moves_the_balance_to_the_general_fund_by_default():
    out, into = settlement_entries(state_with(2500), S, "general", None, "x1")
    assert out == {
        "type": "transfer",
        "transferId": "x1",
        "scoutId": S,
        "amountCents": -2500,
        "description": "Balance moved to the troop's general fund",
    }
    assert into["scoutId"] == GENERAL_FUND and into["amountCents"] == 2500
    assert compute_account({"a": {"scoutId": S, "type": "sale", "amountCents": 2500}, "o": out}).balance == 0


def test_leaving_can_move_the_balance_to_a_sibling_without_naming_either_child():
    out, into = settlement_entries(state_with(1200), S, "sibling", "s2", "x2")
    assert into["scoutId"] == "s2" and into["amountCents"] == 1200
    assert "sibling" in out["description"] and "sibling" in into["description"]


def test_settlement_never_pays_out_and_needs_a_sibling():
    with pytest.raises(InvalidInput):
        settlement_entries(state_with(1200), S, "cash", None, "x")
    with pytest.raises(InvalidInput, match="sibling"):
        settlement_entries(state_with(1200), S, "sibling", None, "x")
    with pytest.raises(InvalidInput, match="below zero"):
        settlement_entries(
            compute_account({"c": {"type": "charge", "amountCents": -500, "fromCredit": True}}), S, "sibling", "s2", "x"
        )


def test_settlement_moves_only_the_balance_and_leaves_open_charges():
    assert settlement_entries(state_with(0, 3500), S, "general", None, "x") == []
    out, _ = settlement_entries(state_with(1000, 3500), S, "general", None, "x")
    assert out["amountCents"] == -1000


def test_scrub_replaces_the_full_name_and_each_part_as_whole_words():
    label = "Former Scout 12345678"
    assert scrub("Sam Lee popcorn", "Sam Lee", label) == f"{label} popcorn"
    assert scrub("Paid for sam's camp", "Sam Lee", label) == f"Paid for {label}'s camp"
    assert scrub("Sample sale", "Sam Lee", label) == "Sample sale"  # not inside another word
    assert scrub("", "Sam", label) == ""
    assert scrub("Camp", "", label) == "Camp"


def test_anonymized_rekeys_the_entry_and_takes_out_the_name():
    entry = {"scoutId": S, "description": "Ava's campout", "reason": "Ava did not go", "amountCents": -3500}
    fields = anonymized(entry, "12345678", "Ava Chen")
    assert fields["scoutId"] == former_id("12345678") == "former-12345678"
    assert fields["scoutRef"] == "12345678" and fields["anonymized"] is True
    assert fields["description"] == "Former Scout 12345678's campout"
    assert "Ava" not in fields["reason"]
    assert "amountCents" not in fields  # the books still balance
    assert is_former("former-1") and not is_former(S)


def test_entries_are_due_seven_years_after_their_date():
    assert entry_due({"date": "2026-10-16"}, TODAY)
    assert not entry_due({"date": "2026-10-17"}, TODAY)
    assert not entry_due({}, TODAY)
    assert not entry_due({"date": "garbage"}, TODAY)
    assert ledger_cutoff(TODAY) > "2026-10-16"


def old(entry, day="2026-01-05"):
    return {"scoutId": S, "date": day, **entry}


def test_purge_of_a_settled_account_needs_no_carry():
    entries = {
        "a": old({"type": "sale", "amountCents": 3000}),
        "c": old({"type": "charge", "amountCents": -3000, "fromCredit": True}),
    }
    assert plan_purge(S, entries, TODAY) == (["a", "c"], [])


def test_purge_brings_the_balance_and_open_charges_forward():
    entries = {
        "a": old({"type": "sale", "amountCents": 5000}),
        "c": old({"type": "charge", "amountCents": -2000, "fromCredit": False}),
        "new": {"scoutId": S, "date": "2033-01-01", "type": "sale", "amountCents": 700},
    }
    before = compute_account(entries)
    drop, carry = plan_purge(S, entries, TODAY)
    assert drop == ["a", "c"]
    assert all(e["broughtForward"] and e["replaces"] == ["a", "c"] for e in carry)
    after = compute_account({"new": entries["new"], **{f"k{i}": e for i, e in enumerate(carry)}})
    assert (after.balance, after.open_cents) == (before.balance, before.open_cents) == (5700, 2000)


def test_purge_keeps_a_newer_charge_paid_when_its_old_payment_goes():
    entries = {
        "p": old({"type": "payment", "amountCents": 3500, "covers": {"c": 3500}}, "2026-01-05"),
        "c": {"scoutId": S, "date": "2027-01-01", "type": "charge", "amountCents": -3500, "fromCredit": False},
    }
    before = compute_account(entries)
    drop, carry = plan_purge(S, entries, TODAY)
    assert drop == ["p"]
    after = compute_account({"c": entries["c"], **{f"k{i}": e for i, e in enumerate(carry)}})
    assert (after.balance, after.open_cents) == (before.balance, before.open_cents) == (0, 0)


def test_a_repeated_purge_after_a_failed_delete_does_not_carry_twice():
    entries = {
        "a": old({"type": "sale", "amountCents": 5000}),
        "new": {"scoutId": S, "date": "2033-01-01", "type": "sale", "amountCents": 700},
    }
    _, carry = plan_purge(S, entries, TODAY)
    posted = {**entries, **{f"k{i}": {**e, "date": "2033-10-16"} for i, e in enumerate(carry)}}
    assert compute_account(posted).balance == 5700  # the replaced entries no longer count
    drop, again = plan_purge(S, posted, TODAY)
    assert drop == ["a"] and again == []


def test_nothing_due_means_nothing_planned():
    assert plan_purge(S, {"a": {"date": "2033-01-01", "type": "sale", "amountCents": 1}}, TODAY) == ([], [])
