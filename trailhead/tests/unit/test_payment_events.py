"""Stripe webhook events: every event type, checks that keep a mismatched event from being credited, idempotency, and
the HTTP answers (400 bad signature, 500 retry, 200 otherwise). The Firestore side runs in tests/integration."""

import json
import time

import pytest
from flask import Request
from werkzeug.test import EnvironBuilder

from endpoints import stripe_webhook as hook
from handlers.payment_events import Action, dispute_fields, read_event, session_problem, status_update
from handlers.stripe_wire import sign

ACCT = "acct_troop"
META = {"troopId": "t1", "paymentId": "pay1", "scoutId": "s1", "chargeIds": "c1"}


def event(kind, obj, account=ACCT, livemode=False):
    return {"id": "evt_1", "type": kind, "account": account, "livemode": livemode, "data": {"object": obj}}


def session(**extra):
    return {
        "id": "cs_1",
        "object": "checkout.session",
        "metadata": META,
        "client_reference_id": "pay1",
        "payment_intent": "pi_1",
        "payment_status": "paid",
        "amount_total": 3635,
        "currency": "usd",
        **extra,
    }


RECORD = {"stripeAccountId": ACCT, "sessionId": "cs_1", "mode": "test", "totalCents": 3635, "status": "open"}


def test_a_completed_paid_session_is_a_payment():
    a = read_event(event("checkout.session.completed", session()))
    assert (a.kind, a.troop_id, a.payment_id, a.session_id, a.payment_intent) == ("paid", "t1", "pay1", "cs_1", "pi_1")
    assert (a.amount_total, a.currency, a.account, a.livemode) == (3635, "usd", ACCT, False)


def test_a_completed_but_unpaid_session_is_still_processing():
    assert read_event(event("checkout.session.completed", session(payment_status="unpaid"))).kind == "processing"


@pytest.mark.parametrize(
    "kind,expected",
    [
        ("checkout.session.async_payment_succeeded", "paid"),
        ("checkout.session.async_payment_failed", "failed"),
        ("checkout.session.expired", "expired"),
    ],
)
def test_other_session_events(kind, expected):
    assert read_event(event(kind, session())).kind == expected


def test_the_payment_id_falls_back_to_the_client_reference():
    a = read_event(event("checkout.session.completed", session(metadata={}, client_reference_id="pay9")))
    assert a.payment_id == "pay9" and a.troop_id is None


def test_a_refund():
    charge = {"id": "ch_1", "payment_intent": "pi_1", "amount_refunded": 1000, "metadata": META}
    a = read_event(event("charge.refunded", charge))
    assert (a.kind, a.payment_intent, a.refunded, a.details) == ("refund", "pi_1", 1000, {"chargeId": "ch_1"})
    assert read_event(event("charge.refunded", {**charge, "amount_refunded": "x"})).refunded == 0


@pytest.mark.parametrize("kind", ["charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"])
def test_disputes(kind):
    dispute = {"id": "dp_1", "payment_intent": {"id": "pi_1"}, "status": "needs_response", "reason": "fraudulent"}
    a = read_event(event(kind, {**dispute, "amount": 3635}))
    assert a.kind == "dispute" and a.payment_intent == "pi_1"
    assert a.details == {"id": "dp_1", "status": "needs_response", "reason": "fraudulent", "amountCents": 3635}


def test_account_events():
    a = read_event(event("account.updated", {"id": ACCT, "charges_enabled": True, "details_submitted": True}))
    assert a.kind == "account" and a.account == ACCT and a.details == {"chargesEnabled": True, "detailsSubmitted": True}
    assert read_event(event("account.application.deauthorized", {"id": "ca_1"})).kind == "deauthorized"


def test_anything_else_is_ignored():
    assert read_event(event("customer.created", {})).kind == "ignore"
    assert read_event({}).kind == "ignore"


def paid(**extra):
    base = {"kind": "paid", "account": ACCT, "session_id": "cs_1", "amount_total": 3635, "currency": "usd"}
    return Action(**{**base, **extra})


def test_session_problem_catches_every_mismatch():
    assert session_problem(RECORD, paid()) is None
    assert session_problem(RECORD, paid(account="acct_other")) == "account"
    assert session_problem(RECORD, paid(session_id="cs_2")) == "session"
    assert session_problem(RECORD, paid(livemode=True)) == "mode"
    assert session_problem(RECORD, paid(amount_total=1)) == "amount"
    assert session_problem(RECORD, paid(currency="eur")) == "amount"
    # Before the session id was saved, the account, mode and amount still have to match.
    assert session_problem({**RECORD, "sessionId": None}, paid(session_id="cs_9")) is None


def test_status_updates_never_move_a_paid_record_back_and_repeat_safely():
    assert status_update(RECORD, Action("expired")) == {"status": "expired"}
    assert status_update({**RECORD, "status": "expired"}, Action("expired")) is None
    assert status_update({**RECORD, "status": "paid", "ledgerEntryId": "e1"}, Action("failed")) is None
    assert status_update({**RECORD, "status": "processing"}, Action("failed")) == {"status": "failed"}
    assert status_update({**RECORD, "status": "refunded"}, Action("expired")) is None


def test_dispute_fields_change_only_when_the_dispute_does():
    details = {"id": "dp_1", "status": "needs_response", "reason": "fraudulent", "amountCents": 3635}
    assert dispute_fields(RECORD, Action("dispute", details=details)) == {"dispute": details}
    assert dispute_fields({**RECORD, "dispute": details}, Action("dispute", details=details)) is None
    assert dispute_fields({**RECORD, "dispute": details}, Action("dispute", details={**details, "status": "lost"}))


class FakeRef:
    def __init__(self, data):
        self.data, self.updates, self.id = data, [], "pay1"

    def get(self, transaction=None):
        return self

    def to_dict(self):
        return self.data

    def update(self, fields):
        self.updates.append(fields)


def test_credit_is_idempotent_and_refuses_a_mismatch(monkeypatch):
    posted = []
    monkeypatch.setattr(hook, "post", lambda *a, **k: posted.append(a))
    done = FakeRef({**RECORD, "scoutId": "s1", "ledgerEntryId": "e1"})
    monkeypatch.setattr(hook, "_record_ref", lambda t, p: done)
    assert hook.credit(paid(troop_id="t1", payment_id="pay1")) == "already" and not posted

    wrong = FakeRef({**RECORD, "scoutId": "s1"})
    monkeypatch.setattr(hook, "_record_ref", lambda t, p: wrong)
    assert hook.credit(paid(troop_id="t1", payment_id="pay1", amount_total=1)) == "review:amount"
    assert wrong.updates[0]["status"] == "review" and not posted

    monkeypatch.setattr(hook, "_record_ref", lambda t, p: None)
    assert hook.credit(paid()) == "not-ours"


def test_a_refund_before_its_payment_is_retried(monkeypatch):
    ref = FakeRef({**RECORD, "scoutId": "s1"})
    monkeypatch.setattr(hook, "_locate", lambda a: (ref, "t1"))
    with pytest.raises(hook.Retry):
        hook.refund(Action("refund", account=ACCT, refunded=100))
    monkeypatch.setattr(hook, "_locate", lambda a: (None, None))
    assert hook.refund(Action("refund", account=ACCT, refunded=100)) == "not-ours"  # some other charge on the account


def test_record_ref_refuses_odd_ids():
    assert hook._record_ref(None, "p") is None and hook._record_ref("t/../x", "p") is None


SECRET = "whsec_unit"


def request(body: bytes, head: str | None, method="POST") -> Request:
    headers = {"Stripe-Signature": head} if head is not None else {}
    return Request(EnvironBuilder(method=method, data=body, headers=headers).get_environ())


def signed(body: bytes) -> str:
    stamp = int(time.time())
    return f"t={stamp},v1={sign(body, SECRET, stamp)}"


@pytest.fixture
def secret(monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", SECRET)


def test_the_webhook_answers(monkeypatch, secret):
    body = json.dumps(event("checkout.session.completed", session())).encode()
    monkeypatch.setattr(hook, "handle", lambda e: "posted")
    good = hook.stripe_webhook.__wrapped__(request(body, signed(body)))
    assert good.status_code == 200 and json.loads(good.get_data())["outcome"] == "posted"
    assert hook.stripe_webhook.__wrapped__(request(body, "t=1,v1=00")).status_code == 400
    assert hook.stripe_webhook.__wrapped__(request(body, None)).status_code == 400
    assert hook.stripe_webhook.__wrapped__(request(b"", None, method="GET")).status_code == 405

    def retry(e):
        raise hook.Retry("later")

    monkeypatch.setattr(hook, "handle", retry)
    assert hook.stripe_webhook.__wrapped__(request(body, signed(body))).status_code == 500

    def boom(e):
        raise RuntimeError("firestore down")

    monkeypatch.setattr(hook, "handle", boom)
    assert hook.stripe_webhook.__wrapped__(request(body, signed(body))).status_code == 500


def test_ignored_events_never_touch_firestore():
    assert hook.handle(event("customer.created", {})) == "ignored"
