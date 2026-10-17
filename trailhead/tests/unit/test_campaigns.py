"""Fundraiser credit rules and the troop's account settings."""

import pytest

from handlers.account_settings import DEFAULTS, parse_settings, settings_of
from handlers.campaigns import campaign_totals, credit_for, parse_campaign, parse_rule, parse_sales, sale_entries
from handlers.membership import InvalidInput

PERCENT_30 = {"kind": "percent", "value": 3000}


def test_percent_rule_rounds_half_a_cent_up():
    assert credit_for(PERCENT_30, 10000, 0) == 3000
    assert credit_for({"kind": "percent", "value": 1250}, 1003, 0) == 125  # 125.375 cents
    assert credit_for({"kind": "percent", "value": 5000}, 1, 0) == 1  # half a cent rounds up


def test_per_item_and_none_rules():
    assert credit_for({"kind": "perItem", "value": 150}, 99999, 12) == 1800
    assert credit_for({"kind": "none", "value": 0}, 10000, 5) == 0


def test_the_default_rule_keeps_all_profit_with_the_troop():
    assert DEFAULTS["defaultRule"] == {"kind": "percent", "value": 0}
    assert credit_for(DEFAULTS["defaultRule"], 50000, 10) == 0


def test_parse_rule_checks_kind_and_range():
    assert parse_rule(PERCENT_30) == PERCENT_30
    assert parse_rule({"kind": "none", "value": 99}) == {"kind": "none", "value": 0}
    for bad in ({"kind": "percent", "value": 10001}, {"kind": "perItem", "value": -1}, {"kind": "share"}, None):
        with pytest.raises(InvalidInput):
            parse_rule(bad)
    with pytest.raises(InvalidInput):
        parse_rule({"kind": "percent", "value": 30.5})


def test_sales_only_for_roster_scouts_and_empty_rows_dropped():
    sales = parse_sales({"s1": {"salesCents": 10000, "items": 8}, "s2": {"salesCents": 0, "items": 0}}, {"s1", "s2"})
    assert sales == {"s1": {"salesCents": 10000, "items": 8}}
    with pytest.raises(InvalidInput, match="roster"):
        parse_sales({"ghost": {"salesCents": 100}}, {"s1"})
    with pytest.raises(InvalidInput):
        parse_sales({"s1": {"salesCents": -5}}, {"s1"})


def test_totals_split_sales_between_scouts_and_troop():
    sales = {"s1": {"salesCents": 10000, "items": 8}, "s2": {"salesCents": 4550, "items": 3}}
    assert campaign_totals(PERCENT_30, sales) == {"salesCents": 14550, "creditCents": 4365, "troopCents": 10185}


def test_sale_entries_credit_each_scout_with_more_than_zero():
    campaign = {
        "name": "Fall popcorn 2026",
        "rule": PERCENT_30,
        "sales": {"s2": {"salesCents": 1, "items": 0}, "s1": {"salesCents": 10000, "items": 8}},
    }
    entries = sale_entries("c1", campaign)
    assert [e["scoutId"] for e in entries] == ["s1"]  # 30% of one cent rounds to zero, so no entry for s2
    assert entries[0] == {
        "scoutId": "s1",
        "type": "sale",
        "amountCents": 3000,
        "campaignId": "c1",
        "description": "Fall popcorn 2026: credit on sales of $100.00",
    }
    assert sale_entries("c1", {**campaign, "rule": {"kind": "none", "value": 0}}) == []


def test_parse_campaign_needs_a_name():
    with pytest.raises(InvalidInput, match="Campaign name"):
        parse_campaign({"name": " ", "rule": PERCENT_30}, set())


def test_settings_fill_in_defaults_and_ignore_unknown_keys():
    assert settings_of(None) == DEFAULTS
    assert DEFAULTS["allowNegative"] is False and DEFAULTS["leavingDefault"] == "general"
    saved = settings_of({"accounts": {"allowNegative": True, "cashOut": True}})
    assert saved["allowNegative"] is True and "cashOut" not in saved


def test_parse_settings_validates_every_field():
    good = {
        "allowNegative": False,
        "defaultRule": PERCENT_30,
        "creditPolicy": " Campouts and camp ",
        "leavingDefault": "sibling",
    }
    assert parse_settings(good)["creditPolicy"] == "Campouts and camp"
    for change in ({"allowNegative": "no"}, {"leavingDefault": "cash"}, {"creditPolicy": "x" * 601}):
        with pytest.raises(InvalidInput):
            parse_settings({**good, **change})
