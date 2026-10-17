"""The urllib Stripe client against the fake Stripe server the emulator tests use (both on this machine only)."""

import pytest

from endpoints.stripe_api import Config, Stripe, StripeError
from tests.integration.fake_stripe import FakeStripe


@pytest.fixture
def fake():
    server = FakeStripe()
    yield server
    server.stop()


def test_the_client_talks_to_the_fake_over_real_http(fake):
    stripe = Stripe(Config("test", "sk_test_unit", fake.base))
    account = stripe.post("/v1/accounts", {"type": "standard", "country": "US"}, "acct-key")
    assert account["id"] == "acct_fake_1"
    assert stripe.post("/v1/accounts", {"type": "standard"}, "acct-key") == account  # same key, same answer
    assert stripe.get(f"/v1/accounts/{account['id']}")["charges_enabled"] is True

    items = [{"quantity": 1, "price_data": {"unit_amount": 3500}}, {"quantity": 1, "price_data": {"unit_amount": 135}}]
    session = stripe.post("/v1/checkout/sessions", {"line_items": items}, "cs-key", account=account["id"])
    assert session["amount_total"] == 3635 and session["url"].startswith("https://checkout.stripe.com/")
    sent = fake.posts("/v1/checkout/sessions")[0]
    assert sent["headers"]["stripe-account"] == "acct_fake_1" and sent["headers"]["idempotency-key"] == "cs-key"
    assert sent["headers"]["authorization"] == "Bearer sk_test_unit"
    assert sent["form"]["line_items[1][price_data][unit_amount]"] == "135"

    fake.fail_next = 500
    with pytest.raises(StripeError) as err:
        stripe.get("/v1/accounts/acct_fake_1")
    assert err.value.status == 500
