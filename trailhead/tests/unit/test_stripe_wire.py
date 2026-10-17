"""Stripe without its package: webhook signatures (good, bad, stale), form encoding, and the urllib client."""

import json

import pytest

from endpoints.stripe_api import API_BASE, Config, Stripe, StripeError, config, local_base
from handlers.stripe_wire import BadSignature, form_encode, parse_header, sign, verify

SECRET = "whsec_unit"
BODY = b'{"id":"evt_1","type":"checkout.session.completed"}'
NOW = 1_800_000_000


def header(stamp=NOW, secret=SECRET, body=BODY, extra=""):
    return f"t={stamp},v1={sign(body, secret, stamp)}{extra}"


def test_a_good_signature_passes():
    verify(BODY, header(), SECRET, NOW)
    verify(BODY, header(stamp=NOW - 299), SECRET, NOW)
    # Stripe sends several v1 values while a secret is being rolled; any match is enough.
    verify(BODY, f"t={NOW},v1=deadbeef,v1={sign(BODY, SECRET, NOW)},v0=old", SECRET, NOW)


@pytest.mark.parametrize(
    "head",
    [
        header(secret="whsec_other"),  # signed with another secret
        header(body=b'{"id":"evt_2"}'),  # the body was changed
        f"t={NOW}",  # no signature
        f"v1={sign(BODY, SECRET, NOW)}",  # no timestamp
        "",
        None,
        "garbage",
    ],
)
def test_a_bad_signature_fails(head):
    with pytest.raises(BadSignature):
        verify(BODY, head, SECRET, NOW)


def test_a_stale_or_future_signature_fails():
    with pytest.raises(BadSignature, match="too old"):
        verify(BODY, header(stamp=NOW - 301), SECRET, NOW)
    with pytest.raises(BadSignature):
        verify(BODY, header(stamp=NOW + 301), SECRET, NOW)


def test_no_secret_fails_closed():
    with pytest.raises(BadSignature):
        verify(BODY, header(), "", NOW)
    with pytest.raises(BadSignature):
        verify(BODY, header(), None, NOW)


def test_parse_header():
    assert parse_header("t=12, v1=aa ,v1=bb,v0=cc") == (12, ["aa", "bb"])


def test_form_encoding_nests_like_stripe():
    params = {
        "mode": "payment",
        "line_items": [{"quantity": 1, "price_data": {"unit_amount": 3500, "product_data": {"name": "Troop 1 & co"}}}],
        "payment_method_types": ["card"],
        "metadata": {"a": "x y"},
        "flag": True,
        "skip": None,
    }
    assert form_encode(params) == (
        "mode=payment"
        "&line_items[0][quantity]=1"
        "&line_items[0][price_data][unit_amount]=3500"
        "&line_items[0][price_data][product_data][name]=Troop%201%20%26%20co"
        "&payment_method_types[0]=card"
        "&metadata[a]=x%20y"
        "&flag=true"
    )


class FakeHttp:
    def __init__(self, status=200, body=None):
        self.status, self.body, self.calls = status, body or {"id": "x"}, []

    def __call__(self, method, url, headers, body):
        self.calls.append((method, url, headers, body))
        return self.status, self.body


TEST = Config(mode="test", key="sk_test_123")


def test_post_sends_the_key_account_and_idempotency_key():
    http = FakeHttp(body={"id": "cs_1"})
    assert Stripe(TEST, http).post("/v1/checkout/sessions", {"mode": "payment"}, "checkout-p1", "acct_9") == {
        "id": "cs_1"
    }
    method, url, headers, body = http.calls[0]
    assert (method, url, body) == ("POST", f"{API_BASE}/v1/checkout/sessions", b"mode=payment")
    assert headers["Authorization"] == "Bearer sk_test_123" and headers["Stripe-Account"] == "acct_9"
    assert headers["Idempotency-Key"] == "checkout-p1"
    assert headers["Content-Type"] == "application/x-www-form-urlencoded"


def test_every_post_needs_an_idempotency_key():
    with pytest.raises(ValueError):
        Stripe(TEST, FakeHttp()).post("/v1/accounts", {}, "")


def test_get_has_no_body_and_no_idempotency_key():
    http = FakeHttp()
    Stripe(TEST, http).get("/v1/accounts/acct_1")
    method, _, headers, body = http.calls[0]
    assert method == "GET" and body is None and "Idempotency-Key" not in headers and "Stripe-Account" not in headers


def test_a_stripe_error_raises_without_leaking_the_key(caplog):
    http = FakeHttp(402, {"error": {"type": "card_error", "message": "Nope", "code": "x"}})
    with pytest.raises(StripeError) as err:
        Stripe(TEST, http).post("/v1/accounts", {}, "k")
    assert err.value.status == 402 and err.value.code == "x"
    assert "sk_test_123" not in caplog.text


def test_nothing_is_sent_when_payments_are_off_or_the_key_is_for_the_other_mode():
    for cfg in (Config(mode="off", key="sk_test_1"), Config(mode="live", key="sk_test_1"), Config("test", None)):
        http = FakeHttp()
        with pytest.raises(StripeError):
            Stripe(cfg, http).get("/v1/accounts/a")
        assert http.calls == []


def test_config_reads_the_env_and_ignores_the_test_switch_outside_the_emulator():
    switch = lambda: {"mode": "test", "apiBase": "http://127.0.0.1:9999"}  # noqa: E731
    cfg = config({"PAYMENTS_MODE": "live", "STRIPE_SECRET_KEY": "sk_live_1"}, switch)
    assert (cfg.mode, cfg.api_base, cfg.ready) == ("live", API_BASE, True)
    assert config({}, switch).mode == "off"
    on_emulator = config({"FUNCTIONS_EMULATOR": "true", "STRIPE_SECRET_KEY": "sk_test_e"}, switch)
    assert (on_emulator.mode, on_emulator.api_base, on_emulator.ready) == ("test", "http://127.0.0.1:9999", True)
    off = config({"FUNCTIONS_EMULATOR": "true", "PAYMENTS_MODE": "test"}, lambda: {"mode": "off"})
    assert off.mode == "off"


def test_the_fake_stripe_address_must_be_on_this_machine():
    assert local_base("http://localhost:12111/") == "http://localhost:12111"
    assert local_base("https://evil.example.com") is None and local_base(None) is None


def test_http_request_reads_json(monkeypatch):
    from endpoints import stripe_api

    class Response:
        status = 200

        def read(self):
            return json.dumps({"ok": True}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(stripe_api.urllib.request, "urlopen", lambda req, timeout: Response())
    assert stripe_api.http_request("GET", "https://api.stripe.com/v1/x", {}, None) == (200, {"ok": True})

    def boom(req, timeout):
        raise OSError("down")

    monkeypatch.setattr(stripe_api.urllib.request, "urlopen", boom)
    assert stripe_api.http_request("GET", "https://api.stripe.com/v1/x", {}, None) == (0, {})
