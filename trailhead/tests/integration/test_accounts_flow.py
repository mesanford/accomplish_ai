"""End-to-end: Scout accounts. Every money callable checks the treasurer role and writes in a transaction."""

import os
from datetime import date

import pytest
import requests

from tests.integration.test_functions import call, owner
from tests.integration.test_membership_flow import new_scout, new_troop, ok
from tests.integration.test_removal_flow import join
from tests.rules.emulator import DOCS, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
RULE_30 = {"kind": "percent", "value": 3000}
SETTINGS = {
    "allowNegative": False,
    "defaultRule": RULE_30,
    "creditPolicy": "Campouts and camp",
    "leavingDefault": "general",
}


@pytest.fixture(autouse=True)
def clean():
    reset()
    yield


def troop_with_treasurer(number: str) -> tuple[str, str, str]:
    tid = new_troop(number)
    sam = new_scout(tid, "lead", "Sam Lee", 2012)
    ava = new_scout(tid, "lead", "Ava", 2012)
    join(tid, "treas", "treasurer", "Terry Treasurer")  # no Youth Protection date needed for this role
    assert read(f"troops/{tid}/access/treas")["roles"] == ["treasurer"]
    return tid, sam, ava


def entries(tid: str, scout_id: str) -> list[dict]:
    return [e for e in list_docs(f"troops/{tid}/ledger") if e["scoutId"] == scout_id]


def entry_ids(tid: str, scout_id: str) -> list[str]:
    """Ledger ids for one account (`list_docs` returns fields only)."""
    r = requests.get(f"{DOCS}/troops/{tid}/ledger", headers={"Authorization": "Bearer owner"}, timeout=10).json()
    return [
        d["name"].rsplit("/", 1)[-1]
        for d in r.get("documents", [])
        if d["fields"]["scoutId"]["stringValue"] == scout_id
    ]


def account(tid: str, scout_id: str) -> dict:
    return read(f"troops/{tid}/accounts/{scout_id}") or {}


def test_settings_and_campaigns_are_treasurer_only_and_credit_by_the_rule():
    tid, sam, ava = troop_with_treasurer("61")
    assert call("save_account_settings", "lead", {"troopId": tid, **SETTINGS}).status_code == 403
    assert (
        call("save_account_settings", "treas", {"troopId": tid, **SETTINGS, "leavingDefault": "cash"}).status_code
        == 400
    )
    ok(call("save_account_settings", "treas", {"troopId": tid, **SETTINGS}))
    assert read(f"troops/{tid}")["accounts"]["defaultRule"] == RULE_30

    form = {"troopId": tid, "name": "Fall popcorn 2026", "sales": {sam: {"salesCents": 10000, "items": 8}}}
    assert call("save_campaign", "lead", form).status_code == 403
    saved = ok(call("save_campaign", "treas", form))  # no rule given, so the troop's default
    assert saved["totals"] == {"salesCents": 10000, "creditCents": 3000, "troopCents": 7000}
    cid = saved["campaignId"]
    assert call("post_sales", "lead", {"troopId": tid, "campaignId": cid}).status_code == 403

    posted = ok(call("post_sales", "treas", {"troopId": tid, "campaignId": cid}))
    assert posted == {"credited": 1, "creditCents": 3000}
    assert account(tid, sam)["balanceCents"] == 3000
    assert read(f"troops/{tid}/campaigns/{cid}")["status"] == "posted"
    [sale] = entries(tid, sam)
    assert sale["type"] == "sale" and sale["createdByName"] == "Terry Treasurer" and sale["date"]
    # Posted once only, and a posted campaign can't be edited.
    assert call("post_sales", "treas", {"troopId": tid, "campaignId": cid}).status_code == 400
    assert call("save_campaign", "treas", {**form, "campaignId": cid}).status_code == 400
    assert not entries(tid, ava)


def test_a_zero_percent_campaign_keeps_all_profit_with_the_troop():
    tid, sam, _ = troop_with_treasurer("62")
    form = {"troopId": tid, "name": "Wreaths", "sales": {sam: {"salesCents": 5000}}}
    cid = ok(call("save_campaign", "treas", form))["campaignId"]  # the default rule is 0%
    assert ok(call("post_sales", "treas", {"troopId": tid, "campaignId": cid})) == {"credited": 0, "creditCents": 0}
    assert not entries(tid, sam)


def test_charges_payments_and_reversals():
    tid, sam, ava = troop_with_treasurer("63")
    cid = ok(
        call(
            "save_campaign",
            "treas",
            {"troopId": tid, "name": "Popcorn", "rule": RULE_30, "sales": {sam: {"salesCents": 10000}}},
        )
    )["campaignId"]
    ok(call("post_sales", "treas", {"troopId": tid, "campaignId": cid}))

    charge = {"troopId": tid, "scoutIds": [sam, ava], "amountCents": 2500, "description": "Fall campout"}
    assert call("post_charge", "lead", {**charge, "payFrom": "credit"}).status_code == 403
    assert call("post_charge", "treas", {**charge, "amountCents": 0}).status_code == 400
    assert call("post_charge", "treas", {**charge, "scoutIds": ["ghost"]}).status_code == 400
    result = ok(call("post_charge", "treas", {**charge, "payFrom": "credit"}))
    assert (result["posted"], result["paidFromCredit"], result["open"]) == (2, 1, 1)
    assert (account(tid, sam)["balanceCents"], account(tid, sam)["openChargesCents"]) == (500, 0)
    assert (account(tid, ava)["balanceCents"], account(tid, ava)["openChargesCents"]) == (0, 2500)

    [ava_charge] = entry_ids(tid, ava)
    pay = {"troopId": tid, "scoutId": ava, "amountCents": 3000, "method": "check", "chargeIds": [ava_charge]}
    assert call("record_payment", "lead", pay).status_code == 403
    assert call("record_payment", "treas", {**pay, "method": "card"}).status_code == 400
    assert ok(call("record_payment", "treas", {**pay, "note": "Check 1042"}))["coveredCents"] == 2500
    assert (account(tid, ava)["balanceCents"], account(tid, ava)["openChargesCents"]) == (500, 0)

    sam_charge = next(i for i in entry_ids(tid, sam) if read(f"troops/{tid}/ledger/{i}")["type"] == "charge")
    rev = {"troopId": tid, "entryId": sam_charge, "reason": "Sam did not go"}
    assert call("reverse_entry", "lead", rev).status_code == 403
    assert call("reverse_entry", "treas", {**rev, "reason": ""}).status_code == 400
    ok(call("reverse_entry", "treas", rev))
    assert account(tid, sam)["balanceCents"] == 3000
    assert call("reverse_entry", "treas", rev).status_code == 400  # once only
    assert read(f"troops/{tid}/ledger/{sam_charge}")["amountCents"] == -2500  # the original is unchanged


def test_charge_everyone_and_charge_attendees_never_charges_twice():
    tid, sam, ava = troop_with_treasurer("64")
    owner.set(f"troops/{tid}/events/e1", {"title": "Fall campout", "start": "2026-10-10"})
    owner.set(f"troops/{tid}/events/e1/attendance/{sam}", {"present": True})
    owner.set(f"troops/{tid}/events/e1/attendance/{ava}", {"present": False})
    args = {"troopId": tid, "eventId": "e1", "amountCents": 3500, "description": "Fall campout", "payFrom": "open"}
    assert call("charge_attendees", "lead", args).status_code == 403
    assert call("charge_attendees", "treas", {**args, "eventId": "nope"}).status_code == 404
    assert ok(call("charge_attendees", "treas", args))["posted"] == 1
    again = ok(call("charge_attendees", "treas", args))
    assert again["posted"] == 0 and again["skipped"] == [sam]
    assert account(tid, sam)["openChargesCents"] == 3500 and not entries(tid, ava)

    dues = {"troopId": tid, "everyone": True, "amountCents": 6000, "description": "Annual dues", "payFrom": "open"}
    assert ok(call("post_charge", "treas", dues))["posted"] == 2


def test_post_charges_helper_for_other_server_code():
    tid, sam, ava = troop_with_treasurer("65")
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    from endpoints.charges import post_charges
    from handlers.membership import InvalidInput

    out = post_charges(tid, [sam, ava], 4000, "Summer camp deposit", "camp-2027", "treas", "open", date(2026, 10, 1))
    assert out["posted"] == 2 and out["open"] == 2 and len(out["entryIds"]) == 2
    assert entries(tid, sam)[0]["eventId"] == "camp-2027" and entries(tid, sam)[0]["date"] == "2026-10-01"
    assert post_charges(tid, [sam], 4000, "Summer camp deposit", "camp-2027")["skipped"] == [sam]
    with pytest.raises(InvalidInput):
        post_charges(tid, [sam], -1, "Bad", None)


def test_settling_and_removal_keep_anonymized_books():
    tid, sam, ava = troop_with_treasurer("66")
    join(tid, "mom", "parent", "Jordan", scoutIds=[sam, ava])
    sale = {"troopId": tid, "name": "Popcorn", "rule": RULE_30}
    cid = ok(call("save_campaign", "treas", {**sale, "sales": {sam: {"salesCents": 10000}, ava: {"salesCents": 5000}}}))
    ok(call("post_sales", "treas", {"troopId": tid, "campaignId": cid["campaignId"]}))

    settle = {"troopId": tid, "scoutId": sam, "to": "sibling", "siblingId": ava}
    assert call("settle_account", "lead", settle).status_code == 403
    assert call("settle_account", "treas", {**settle, "to": "cash"}).status_code == 400
    assert ok(call("settle_account", "treas", settle)) == {"movedCents": 3000}
    assert account(tid, sam)["balanceCents"] == 0 and account(tid, ava)["balanceCents"] == 4500

    # Removing Ava keeps her entries under a reference number and moves her balance to the general fund.
    ok(call("remove_scout", "lead", {"troopId": tid, "scoutId": ava, "confirm": True}))
    assert not entries(tid, ava) and read(f"troops/{tid}/accounts/{ava}") is None
    former = [e for e in list_docs(f"troops/{tid}/ledger") if e.get("anonymized")]
    assert former and all(e["scoutId"] == f"former-{e['scoutRef']}" for e in former)
    assert all("Ava" not in e.get("description", "") for e in former)
    assert read(f"troops/{tid}/accounts/troop-fund")["balanceCents"] == 4500
    assert read(f"troops/{tid}/accounts/former-{former[0]['scoutRef']}")["balanceCents"] == 0


def test_deleting_an_account_takes_the_treasurers_name_off_their_entries():
    tid, sam, _ = troop_with_treasurer("67")
    ok(call("post_charge", "treas", {"troopId": tid, "scoutIds": [sam], "amountCents": 500, "description": "Dues"}))
    ok(call("delete_account", "treas", {"confirm": True}))
    [charge] = entries(tid, sam)
    assert charge["createdByName"] == "Former member" and charge["createdBy"] == "former-member"
    assert account(tid, sam)["openChargesCents"] == 500  # the books are unchanged


def test_the_nightly_job_deletes_entries_after_seven_years_and_brings_totals_forward():
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    from endpoints.retention import Budget, run_retention

    tid = new_troop("68")  # no Scouts, so only the ledger rule has anything to do
    t, ref = f"troops/{tid}", "former-11111111"
    base = {"scoutId": ref, "createdBy": "system", "createdByName": "Forthright", "anonymized": True}
    owner.set(f"{t}/ledger/old-sale", {**base, "type": "sale", "amountCents": 3000, "date": "2026-01-05"})
    owner.set(f"{t}/ledger/old-charge", {**base, "type": "charge", "amountCents": -1000, "date": "2026-01-05"})
    owner.set(f"{t}/ledger/new-sale", {**base, "type": "sale", "amountCents": 700, "date": "2033-01-01"})
    owner.set(
        f"{t}/ledger/fund",
        {**base, "scoutId": "troop-fund", "type": "transfer", "amountCents": 0, "date": "2033-01-01"},
    )

    totals = run_retention(date(2033, 10, 16), True, Budget())
    assert totals["ledger"] == 2
    assert read(f"{t}/ledger/old-sale") is None and read(f"{t}/ledger/old-charge") is None
    assert read(f"{t}/ledger/new-sale") is not None
    carried = [e for e in list_docs(f"{t}/ledger") if e.get("broughtForward")]
    assert carried and all(sorted(e["replaces"]) == ["old-charge", "old-sale"] for e in carried)
    summary = read(f"{t}/accounts/{ref}")
    assert (summary["balanceCents"], summary["openChargesCents"]) == (3700, 1000)
    # A second night finds nothing more to delete and does not carry the total twice.
    assert run_retention(date(2033, 10, 17), True, Budget())["ledger"] == 0
    assert read(f"{t}/accounts/{ref}")["balanceCents"] == 3700
