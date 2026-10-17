"""Card payments: fee gross-up and rounding, choosing charges, the generic description, the Checkout Session fields,
and the ledger entries a card payment or refund posts."""

import pytest

from handlers import payments as pay
from handlers.ledger import compute_account
from handlers.membership import InvalidInput

S = "s1"


def charge(cents, day="2026-09-01"):
    return {"scoutId": S, "type": "charge", "amountCents": -cents, "fromCredit": False, "date": day}


def ledger():
    return {"c1": charge(3500, "2026-09-10"), "c2": charge(1200, "2026-08-01"), "c3": charge(800, "2026-09-20")}


MODES = [("test", "test"), ("LIVE", "live"), ("", "off"), (None, "off"), ("on", "off")]


@pytest.mark.parametrize("mode,expected", MODES)
def test_payments_are_off_unless_test_or_live(mode, expected):
    assert pay.payments_mode(mode) == expected


def test_the_key_must_match_the_mode():
    assert pay.key_matches_mode("sk_test_abc", "test") and pay.key_matches_mode("rk_live_abc", "live")
    assert not pay.key_matches_mode("sk_live_abc", "test")
    assert not pay.key_matches_mode("sk_test_abc", "live")
    assert not pay.key_matches_mode(None, "test") and not pay.key_matches_mode("sk_test_abc", "off")


@pytest.mark.parametrize("base", [50, 99, 100, 1000, 3500, 4999, 12345, 100000, 1_000_000])
def test_gross_up_is_the_smallest_total_that_leaves_the_troop_the_full_amount(base):
    total = pay.gross_up(base)
    assert total - pay.stripe_fee(total) >= base
    assert total - 1 - pay.stripe_fee(total - 1) < base


def test_known_fee_amounts():
    # $35.00 grossed up is $36.35: Stripe keeps $1.35 (2.9% of $36.35 is 105.4 cents, plus 30), the troop gets $35.00.
    assert pay.gross_up(3500) == 3635 and pay.fee_for(3500, True) == 135
    assert pay.stripe_fee(10000) == 320
    assert pay.fee_for(3500, False) == 0


def test_stripe_fee_rounds_half_a_cent_up():
    assert pay.stripe_fee(50) == 31  # 1.45 cents rounds to 1
    assert pay.stripe_fee(1000) == 59  # 29.0
    assert pay.stripe_fee(1018) == 60  # 29.522 rounds to 30


def test_choose_charges_keeps_the_chosen_order_and_what_each_owes():
    state = compute_account(ledger())
    assert pay.choose_charges(state, ["c3", "c1", "c3"]) == {"c3": 800, "c1": 3500}
    for bad in ([], "c1", [1], ["nope"], [""]):
        with pytest.raises(InvalidInput):
            pay.choose_charges(state, bad)
    with pytest.raises(InvalidInput, match="20 charges or fewer"):
        pay.choose_charges(compute_account({f"c{i}": charge(100) for i in range(21)}), [f"c{i}" for i in range(21)])


def test_a_partly_paid_charge_costs_only_what_is_left():
    entries = {**ledger(), "p1": {"scoutId": S, "type": "payment", "amountCents": 1000, "covers": {"c1": 1000}}}
    assert pay.choose_charges(compute_account(entries), ["c1"]) == {"c1": 2500}


def test_checkout_amount_comes_from_the_ledger_never_the_browser():
    state = compute_account(ledger())
    ids, amount = pay.checkout_amount(state, {"chargeIds": ["c1", "c2"], "amountCents": 1}, allow_prepay=False)
    assert (ids, amount) == (["c1", "c2"], 4700)


def test_paying_toward_the_balance_needs_the_troop_to_allow_it():
    state = compute_account(ledger())
    with pytest.raises(InvalidInput, match="open charges"):
        pay.checkout_amount(state, {"amountCents": 2000}, allow_prepay=False)
    assert pay.checkout_amount(state, {"amountCents": 2000}, allow_prepay=True) == ([], 2000)
    for bad in (49, 0, -5, "20", True, 1_000_001):
        with pytest.raises(InvalidInput):
            pay.checkout_amount(state, {"amountCents": bad}, allow_prepay=True)


def test_the_description_is_generic():
    troop_doc = {"name": "Troop 101 of St. Mark's", "unitNumber": "101"}
    assert pay.description(troop_doc, ["c1"]) == "Troop 101 activity fees"
    assert pay.description(troop_doc, []) == "Troop 101 Scout account payment"
    assert pay.description({"unitNumber": " 12; DROP"}, ["c1"]) == "Troop 12DROP activity fees"
    assert pay.description({}, ["c1"]) == "Troop activity fees"


def test_session_params_are_a_direct_charge_with_metadata_and_no_platform_fee():
    record = {"scoutId": S, "chargeIds": ["c1", "c2"], "amountCents": 4700, "feeCents": 172}
    record["description"] = "Troop 1 fees"
    urls = {"success": "https://app/ok", "cancel": "https://app/no"}
    p = pay.session_params(record, "pay1", "t1", urls, 1_900_000_000)
    assert p["mode"] == "payment" and p["payment_method_types"] == ["card"]
    assert p["metadata"] == {"troopId": "t1", "scoutId": S, "paymentId": "pay1", "chargeIds": "c1,c2"}
    assert p["payment_intent_data"]["metadata"] == p["metadata"]
    assert "application_fee_amount" not in p["payment_intent_data"] and pay.PLATFORM_FEE_CENTS == 0
    assert [i["price_data"]["unit_amount"] for i in p["line_items"]] == [4700, 172]
    assert p["line_items"][1]["price_data"]["product_data"]["name"].startswith("Card processing fee")
    assert p["client_reference_id"] == "pay1" and p["success_url"] == "https://app/ok"
    no_fee = pay.session_params({**record, "feeCents": 0}, "pay1", "t1", urls, 1)
    assert len(no_fee["line_items"]) == 1


def record(**extra):
    return {"scoutId": S, "chargeIds": ["c1"], "amountCents": 3500, "feeCents": 135, "totalCents": 3635, **extra}


def test_card_payment_covers_the_chosen_charges():
    entries = ledger()
    entry = pay.card_payment_entry(entries, compute_account(entries), record(), "pay1")
    assert entry == {
        "scoutId": S,
        "type": "payment",
        "method": "card",
        "amountCents": 3500,
        "covers": {"c1": 3500},
        "description": "Card payment",
        "paymentId": "pay1",
    }
    after = compute_account({**entries, "p": entry})
    assert "c1" not in after.owed and after.balance == 0


def test_card_payment_never_refuses_when_a_charge_was_paid_another_way_meanwhile():
    entries = {**ledger(), "cash": {"scoutId": S, "type": "payment", "amountCents": 3500, "covers": {"c1": 3500}}}
    entry = pay.card_payment_entry(entries, compute_account(entries), record(), "pay1")
    assert entry["covers"] == {} and entry["amountCents"] == 3500  # it becomes account credit
    assert compute_account({**entries, "p": entry}).balance == 3500


def test_an_amount_toward_the_balance_covers_the_oldest_open_charges_first():
    entries = ledger()
    rec = record(chargeIds=[], amountCents=2000)
    entry = pay.card_payment_entry(entries, compute_account(entries), rec, "pay1")
    assert entry["covers"] == {"c2": 1200, "c1": 800}


def paid_entries():
    entries = ledger()
    entries["p"] = pay.card_payment_entry(entries, compute_account(entries), record(), "pay1")
    return entries


def test_a_full_refund_reverses_the_card_payment_and_reopens_the_charge():
    entries = paid_entries()
    new, done = pay.refund_entries(entries, record(ledgerEntryId="p"), "pay1", 3635)
    assert done == 3500 and len(new) == 1
    assert new[0]["reverses"] == "p" and new[0]["reason"] == "Card refund" and new[0]["amountCents"] == -3500
    state = compute_account({**entries, "r": new[0]})
    assert state.owed["c1"] == 3500 and state.balance == 0


def test_refunds_are_idempotent():
    rec = record(ledgerEntryId="p", refundedLedgerCents=3500)
    assert pay.refund_entries(paid_entries(), rec, "pay1", 3635) == ([], 3500)


def test_a_partial_refund_then_the_rest():
    entries = paid_entries()
    new, done = pay.refund_entries(entries, record(ledgerEntryId="p"), "pay1", 1817)  # about half the card total
    assert done == 1749 and new[0]["amountCents"] == -1749 and "reverses" not in new[0]
    assert new[0]["reason"] == "Card refund"
    entries["a1"] = new[0]
    rec = record(ledgerEntryId="p", refundedLedgerCents=1749, refundEntryIds=["a1"])
    assert pay.refund_entries(entries, rec, "pay1", 1817) == ([], 1749)  # the same event again
    rest, done = pay.refund_entries(entries, rec, "pay1", 3635)
    assert done == 3500 and {e["reverses"] for e in rest} == {"p", "a1"}
    state = compute_account({**entries, **{f"r{i}": e for i, e in enumerate(rest)}})
    assert state.owed["c1"] == 3500 and state.balance == 0


def test_a_refund_of_a_payment_the_treasurer_already_reversed_is_refused_for_review():
    entries = paid_entries()
    entries["x"] = {"scoutId": S, "type": "adjustment", "amountCents": -3500, "reverses": "p", "reason": "oops"}
    with pytest.raises(InvalidInput):
        pay.refund_entries(entries, record(ledgerEntryId="p"), "pay1", 3635)
