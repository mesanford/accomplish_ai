"""End-to-end: card payments on the emulator against a fake Stripe server (tests/integration/fake_stripe.py).

Connecting a troop's Stripe account, starting Checkout, the webhook posting a card payment exactly once, refunds,
disputes, and PAYMENTS_MODE=off refusing everything. Nothing here reaches Stripe.
"""

import json
import os
import time

import pytest
import requests

from tests.integration.fake_stripe import FakeStripe, signature
from tests.integration.test_functions import FUNCTIONS, call, owner
from tests.integration.test_membership_flow import new_scout, new_troop, ok
from tests.integration.test_removal_flow import join
from tests.rules.emulator import PROJECT, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
WEBHOOK = f"{FUNCTIONS}/{PROJECT}/us-central1/stripe_webhook"


@pytest.fixture
def fake():
    reset()
    server = FakeStripe()
    owner.set("_test/payments", {"mode": "test", "apiBase": server.base})
    yield server
    server.stop()


def troop_with_family(number: str):
    tid = new_troop(number)
    sam = new_scout(tid, "lead", "Sam Lee", 2012)
    ava = new_scout(tid, "lead", "Ava Stone", 2012)
    join(tid, "treas", "treasurer", "Terry Treasurer")
    join(tid, "mom", "parent", "Jordan Lee", scoutIds=[sam])
    return tid, sam, ava


def connected(number: str, fake: FakeStripe, **settings):
    tid, sam, ava = troop_with_family(number)
    ok(call("connect_stripe", "treas", {"troopId": tid}))
    ok(call("payments_status", "treas", {"troopId": tid, "refresh": True}))
    if settings:
        base = {"allowNegative": False, "defaultRule": {"kind": "percent", "value": 0}, "creditPolicy": ""}
        ok(call("save_account_settings", "treas", {"troopId": tid, **base, "leavingDefault": "general", **settings}))
    return tid, sam, ava


def open_charge(tid: str, scout: str, cents: int, words: str) -> str:
    form = {"troopId": tid, "scoutIds": [scout], "amountCents": cents, "description": words, "payFrom": "open"}
    return ok(call("post_charge", "treas", form))["entryIds"][0]


def deliver(kind: str, obj: dict, account: str, secret: str | None = None, stamp: int | None = None):
    body = json.dumps({"id": f"evt_{time.time_ns()}", "type": kind, "account": account, "livemode": False,
                       "data": {"object": obj}}).encode()  # fmt: skip
    head = signature(body, stamp or int(time.time()), secret)
    return requests.post(WEBHOOK, data=body, headers={"Stripe-Signature": head}, timeout=30)


def paid_session(tid: str, pid: str, fake: FakeStripe) -> dict:
    record = read(f"troops/{tid}/payments/{pid}")
    return {
        "id": record["sessionId"],
        "metadata": {"troopId": tid, "paymentId": pid},
        "client_reference_id": pid,
        "payment_intent": f"pi_{pid}",
        "payment_status": "paid",
        "amount_total": record["totalCents"],
        "currency": "usd",
    }


def card_entries(tid: str, scout: str) -> list[dict]:
    return [e for e in list_docs(f"troops/{tid}/ledger") if e["scoutId"] == scout and e.get("method") == "card"]


def test_payments_off_hides_and_refuses_everything(fake):
    tid, sam, _ = troop_with_family("81")
    owner.set("_test/payments", {"mode": "off", "apiBase": fake.base})
    assert ok(call("payments_status", "mom", {"troopId": tid})) == {
        "mode": "off",
        "connected": False,
        "chargesEnabled": False,
    }
    assert call("connect_stripe", "treas", {"troopId": tid}).status_code == 400
    charge = open_charge(tid, sam, 3500, "Fall campout")
    assert call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "chargeIds": [charge]}).status_code == 400
    assert fake.requests == []
    assert not list_docs(f"troops/{tid}/payments")


def test_the_treasurer_connects_and_disconnects_stripe(fake):
    tid, _, _ = troop_with_family("82")
    assert call("connect_stripe", "lead", {"troopId": tid}).status_code == 403
    assert call("connect_stripe", "mom", {"troopId": tid}).status_code == 403
    url = ok(call("connect_stripe", "treas", {"troopId": tid}))["url"]
    assert url.startswith("https://connect.stripe.com/") and f"/t/{tid}/accounts/settings" in url
    payments = read(f"troops/{tid}")["payments"]
    assert payments["stripeAccountId"] == "acct_fake_1" and payments["chargesEnabled"] is False
    assert payments["mode"] == "test"
    [created] = fake.posts("/v1/accounts")
    assert created["form"]["type"] == "standard" and created["headers"]["idempotency-key"]
    assert all(r["headers"].get("idempotency-key") for r in fake.posts("/v1/"))

    # Coming back from Stripe: the treasurer's page refreshes the status. Families can't make it ask Stripe.
    assert ok(call("payments_status", "mom", {"troopId": tid, "refresh": True}))["chargesEnabled"] is False
    assert ok(call("payments_status", "treas", {"troopId": tid, "refresh": True}))["chargesEnabled"] is True
    assert read(f"troops/{tid}")["payments"]["chargesEnabled"] is True
    assert ok(call("payments_status", "mom", {"troopId": tid}))["chargesEnabled"] is True

    # Connecting again resumes onboarding for the same account.
    ok(call("connect_stripe", "treas", {"troopId": tid}))
    assert len(fake.posts("/v1/accounts")) == 1

    assert call("disconnect_stripe", "lead", {"troopId": tid}).status_code == 403
    assert ok(call("disconnect_stripe", "treas", {"troopId": tid})) == {"disconnected": True}
    payments = read(f"troops/{tid}")["payments"]
    assert "stripeAccountId" not in payments and payments["previousAccountIds"] == ["acct_fake_1"]
    assert ok(call("payments_status", "mom", {"troopId": tid}))["connected"] is False
    ok(call("connect_stripe", "treas", {"troopId": tid}))
    assert read(f"troops/{tid}")["payments"]["stripeAccountId"] == "acct_fake_2"


def test_a_parent_starts_checkout_for_open_charges(fake):
    tid, sam, ava = connected("83", fake)
    campout = open_charge(tid, sam, 3500, "Fall campout at Camp Tamarack for Sam Lee")
    dues = open_charge(tid, sam, 6000, "Annual dues")
    other = open_charge(tid, ava, 2000, "Fall campout")
    form = {"troopId": tid, "scoutId": sam, "chargeIds": [campout, dues], "amountCents": 1}

    # Only a consented parent of this Scout may pay; leaders and the treasurer can't start a family's payment.
    for uid in ("lead", "treas", "stranger"):
        assert call("create_checkout", uid, form).status_code == 403, uid
    assert call("create_checkout", "mom", {**form, "scoutId": ava, "chargeIds": [other]}).status_code == 403
    assert call("create_checkout", "mom", {**form, "chargeIds": [other]}).status_code == 400  # not Sam's charge
    assert call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "amountCents": 2000}).status_code == 400

    result = ok(call("create_checkout", "mom", form))
    assert result["url"].startswith("https://checkout.stripe.com/")
    record = read(f"troops/{tid}/payments/{result['paymentId']}")
    assert record["amountCents"] == 9500 and record["feeCents"] == 0 and record["totalCents"] == 9500  # not 1 cent
    assert record["status"] == "open" and record["chargeIds"] == [campout, dues] and record["createdBy"] == "mom"
    [sent] = fake.posts("/v1/checkout/sessions")
    assert sent["headers"]["stripe-account"] == "acct_fake_1"
    assert sent["headers"]["idempotency-key"] == f"checkout-{result['paymentId']}"
    assert sent["form"]["line_items[0][price_data][product_data][name]"] == "Troop 83 activity fees"
    assert sent["form"]["metadata[chargeIds]"] == f"{campout},{dues}"
    assert sent["form"]["metadata[troopId]"] == tid and sent["form"]["metadata[scoutId]"] == sam
    assert "Lee" not in sent["raw"] and "Tamarack" not in sent["raw"]  # no Scout name or event detail goes to Stripe
    assert "application_fee_amount" not in sent["raw"]

    # Starting again ends the first checkout (one unfinished checkout per Scout), so a charge is never paid twice.
    again = ok(call("create_checkout", "mom", {**form, "chargeIds": [campout]}))
    assert fake.posts(f"/v1/checkout/sessions/{record['sessionId']}/expire")
    assert read(f"troops/{tid}/payments/{result['paymentId']}")["status"] == "expired"
    fake.expire_status = 400  # Stripe says that one already completed
    assert call("create_checkout", "mom", {**form, "chargeIds": [campout]}).status_code == 400
    assert read(f"troops/{tid}/payments/{again['paymentId']}")["status"] == "open"


def test_the_card_fee_prepaying_and_the_daily_limit(fake):
    tid, sam, _ = connected("84", fake, cardFee=True, allowPrepay=True)
    charge = open_charge(tid, sam, 3500, "Fall campout")
    pid = ok(call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "chargeIds": [charge]}))["paymentId"]
    record = read(f"troops/{tid}/payments/{pid}")
    assert (record["amountCents"], record["feeCents"], record["totalCents"]) == (3500, 135, 3635)
    sent = fake.posts("/v1/checkout/sessions")[-1]["form"]
    assert sent["line_items[1][price_data][product_data][name]"].startswith("Card processing fee")
    prepay = ok(call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "amountCents": 2000}))
    assert read(f"troops/{tid}/payments/{prepay['paymentId']}")["chargeIds"] == []
    for _ in range(8):
        ok(call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "amountCents": 2000}))
    assert call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "amountCents": 2000}).status_code == 429


def test_stripe_failing_leaves_no_record_and_charges_nothing(fake):
    tid, sam, _ = connected("85", fake)
    charge = open_charge(tid, sam, 3500, "Fall campout")
    fake.fail_next = 500
    assert call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "chargeIds": [charge]}).status_code == 503
    assert not list_docs(f"troops/{tid}/payments")


def test_the_webhook_posts_the_payment_exactly_once(fake):
    tid, sam, _ = connected("86", fake)
    charge = open_charge(tid, sam, 3500, "Fall campout")
    pid = ok(call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "chargeIds": [charge]}))["paymentId"]
    session = paid_session(tid, pid, fake)

    assert deliver("checkout.session.completed", session, "acct_fake_1", secret="whsec_wrong").status_code == 400
    stale = int(time.time()) - 600
    assert deliver("checkout.session.completed", session, "acct_fake_1", stamp=stale).status_code == 400
    assert not card_entries(tid, sam)

    first = deliver("checkout.session.completed", session, "acct_fake_1")
    assert first.status_code == 200 and first.json()["outcome"] == "posted"
    again = deliver("checkout.session.completed", session, "acct_fake_1")
    assert again.status_code == 200 and again.json()["outcome"] == "already"
    [entry] = card_entries(tid, sam)
    assert entry["amountCents"] == 3500 and entry["covers"] == {charge: 3500} and entry["description"] == "Card payment"
    assert entry["createdByName"] == "Forthright"
    account = read(f"troops/{tid}/accounts/{sam}")
    assert account["openChargesCents"] == 0 and account["balanceCents"] == 0
    record = read(f"troops/{tid}/payments/{pid}")
    assert record["status"] == "paid" and record["paymentIntentId"] == f"pi_{pid}" and record["coveredCents"] == 3500
    assert read(f"stripeLookup/pi_{pid}") == {"troopId": tid, "paymentId": pid}

    # A late "expired" never moves a paid record back.
    assert deliver("checkout.session.expired", session, "acct_fake_1").json()["outcome"] == "unchanged"


def test_a_session_that_does_not_match_its_record_is_never_credited(fake):
    tid, sam, _ = connected("87", fake)
    charge = open_charge(tid, sam, 3500, "Fall campout")
    pid = ok(call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "chargeIds": [charge]}))["paymentId"]
    session = paid_session(tid, pid, fake)
    assert deliver("checkout.session.completed", session, "acct_someone_else").json()["outcome"] == "review:account"
    assert deliver("checkout.session.completed", {**session, "amount_total": 50}, "acct_fake_1").status_code == 200
    assert not card_entries(tid, sam) and read(f"troops/{tid}/payments/{pid}")["status"] == "review"
    unknown = {**session, "metadata": {"troopId": tid, "paymentId": "nope"}, "client_reference_id": "nope"}
    assert deliver("checkout.session.completed", unknown, "acct_fake_1").json()["outcome"] == "not-ours"


def test_failed_and_expired_sessions(fake):
    tid, sam, _ = connected("88", fake)
    charge = open_charge(tid, sam, 3500, "Fall campout")
    pid = ok(call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "chargeIds": [charge]}))["paymentId"]
    session = {**paid_session(tid, pid, fake), "payment_status": "unpaid"}
    assert deliver("checkout.session.completed", session, "acct_fake_1").json()["outcome"] == "updated"
    assert read(f"troops/{tid}/payments/{pid}")["status"] == "processing"
    assert deliver("checkout.session.async_payment_failed", session, "acct_fake_1").json()["outcome"] == "updated"
    assert read(f"troops/{tid}/payments/{pid}")["status"] == "failed"
    assert not card_entries(tid, sam)


def test_refunds_reverse_the_payment_and_disputes_are_kept(fake):
    tid, sam, _ = connected("89", fake)
    charge = open_charge(tid, sam, 3500, "Fall campout")
    pid = ok(call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "chargeIds": [charge]}))["paymentId"]
    refund = {"id": "ch_1", "payment_intent": f"pi_{pid}", "amount_refunded": 3500}
    assert deliver("charge.refunded", refund, "acct_fake_1").status_code == 500  # before the payment: Stripe retries

    deliver("checkout.session.completed", paid_session(tid, pid, fake), "acct_fake_1")
    partial = deliver("charge.refunded", {**refund, "amount_refunded": 1000}, "acct_fake_1")
    assert partial.json()["outcome"] == "posted"
    assert read(f"troops/{tid}/payments/{pid}")["status"] == "partially_refunded"
    assert read(f"troops/{tid}/accounts/{sam}")["balanceCents"] == -1000

    full = deliver("charge.refunded", refund, "acct_fake_1")
    assert full.json()["outcome"] == "posted"
    assert deliver("charge.refunded", refund, "acct_fake_1").json()["outcome"] == "already"
    refunds = [e for e in list_docs(f"troops/{tid}/ledger") if e.get("reason") == "Card refund"]
    assert len(refunds) == 3  # the partial adjustment, then reversals of the payment and of that adjustment
    account = read(f"troops/{tid}/accounts/{sam}")
    assert (account["balanceCents"], account["openChargesCents"]) == (0, 3500)  # the charge is open again
    assert read(f"troops/{tid}/payments/{pid}")["status"] == "refunded"

    dispute = {"id": "dp_1", "payment_intent": f"pi_{pid}", "status": "needs_response", "reason": "fraudulent"}
    assert deliver("charge.dispute.created", {**dispute, "amount": 3500}, "acct_fake_1").json()["outcome"] == "updated"
    assert read(f"troops/{tid}/payments/{pid}")["dispute"]["status"] == "needs_response"
    other = {"id": "ch_x", "payment_intent": "pi_not_forthright", "amount_refunded": 100}
    assert deliver("charge.refunded", other, "acct_fake_1").json()["outcome"] == "not-ours"


def test_account_updates_follow_stripe(fake):
    tid, _, _ = connected("90", fake)
    updated = {"id": "acct_fake_1", "charges_enabled": False, "details_submitted": True}
    assert deliver("account.updated", updated, "acct_fake_1").json()["outcome"] == "troops:1"
    assert read(f"troops/{tid}")["payments"]["chargesEnabled"] is False
    assert deliver("account.application.deauthorized", {"id": "ca_1"}, "acct_fake_1").status_code == 200
    assert "stripeAccountId" not in read(f"troops/{tid}")["payments"]


def test_clients_never_see_the_lookup_or_test_switch(fake):
    tid, sam, _ = connected("91", fake)
    charge = open_charge(tid, sam, 3500, "Fall campout")
    pid = ok(call("create_checkout", "mom", {"troopId": tid, "scoutId": sam, "chargeIds": [charge]}))["paymentId"]
    deliver("checkout.session.completed", paid_session(tid, pid, fake), "acct_fake_1")
    from tests.rules.emulator import Client

    mom = Client("mom")
    assert mom.get(f"troops/{tid}/payments/{pid}") == 200
    assert mom.get(f"stripeLookup/pi_{pid}") == 403 and mom.get("_test/payments") == 403
