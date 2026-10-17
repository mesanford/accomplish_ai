"""Calling the Stripe REST API with urllib (the `stripe` package is not used), and reading the payments settings.

PAYMENTS_MODE (an env setting) is "off" by default, "test" or "live". The secret key comes from the STRIPE_SECRET_KEY
secret and must match the mode (sk_test_ in test, sk_live_ in live). Every POST carries an idempotency key, and calls
for a troop's own account carry its `Stripe-Account` header.

In the Functions emulator only, a server-only document `_test/payments` may set {"mode", "apiBase"} so tests can turn
payments on and point them at a fake Stripe server on this machine. Real deployments never read it.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass

from handlers.payments import key_matches_mode, payments_mode
from handlers.stripe_wire import form_encode

log = logging.getLogger(__name__)
API_BASE = "https://api.stripe.com"
STRIPE_VERSION = "2024-06-20"
Http = Callable[[str, str, dict, bytes | None], tuple[int, dict]]  # (method, url, headers, body) -> (status, json)


class StripeError(Exception):
    """Stripe refused or could not be reached. `status` 0 means no answer. The message is never shown to families."""

    def __init__(self, status: int, message: str, code: str | None = None):
        super().__init__(message)
        self.status, self.code = status, code


@dataclass(frozen=True)
class Config:
    mode: str
    key: str | None
    api_base: str = API_BASE

    @property
    def on(self) -> bool:
        return self.mode != "off"

    @property
    def ready(self) -> bool:
        return self.on and key_matches_mode(self.key, self.mode)


def in_emulator(env=os.environ) -> bool:
    return env.get("FUNCTIONS_EMULATOR") == "true"


def _emulator_override() -> dict:
    from fb import db

    try:
        return db().collection("_test").document("payments").get().to_dict() or {}
    except Exception:
        return {}


def local_base(value) -> str | None:
    text = str(value or "")
    return text.rstrip("/") if text.startswith(("http://127.0.0.1:", "http://localhost:")) else None


def config(env=os.environ, override: Callable[[], dict] = _emulator_override) -> Config:
    mode, base = payments_mode(env.get("PAYMENTS_MODE")), API_BASE
    if in_emulator(env):
        found = override()
        mode = payments_mode(found.get("mode", mode))
        base = local_base(found.get("apiBase")) or base
    return Config(mode=mode, key=env.get("STRIPE_SECRET_KEY"), api_base=base)


def http_request(method: str, url: str, headers: dict, body: bytes | None) -> tuple[int, dict]:
    request = urllib.request.Request(url, body, headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as err:
        try:
            return err.code, json.loads(err.read() or b"{}")
        except ValueError:
            return err.code, {}
    except Exception:
        return 0, {}


class Stripe:
    def __init__(self, cfg: Config, http: Http = http_request):
        self.cfg, self.http = cfg, http

    def _headers(self, account: str | None, idem: str | None) -> dict:
        headers = {
            "Authorization": f"Bearer {self.cfg.key}",
            "Stripe-Version": STRIPE_VERSION,
            "User-Agent": "Forthright/1.0",
        }
        if account:
            headers["Stripe-Account"] = account
        if idem:
            headers["Idempotency-Key"] = idem
        return headers

    def _send(self, method: str, path: str, account: str | None, idem: str | None, params: dict | None) -> dict:
        if not self.cfg.ready:
            raise StripeError(0, "payments are off or the key does not match the mode")
        body = form_encode(params or {}).encode() if method == "POST" else None
        headers = self._headers(account, idem)
        if body is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        status, data = self.http(method, f"{self.cfg.api_base}{path}", headers, body)
        if not 200 <= status < 300:
            error = (data or {}).get("error") or {}
            log.error("stripe %s %s failed status=%s type=%s", method, path.split("/")[2], status, error.get("type"))
            raise StripeError(status, error.get("message") or "Stripe request failed", error.get("code"))
        return data

    def post(self, path: str, params: dict, idem: str, account: str | None = None) -> dict:
        if not idem:
            raise ValueError("every Stripe POST needs an idempotency key")
        return self._send("POST", path, account, idem, params)

    def get(self, path: str, account: str | None = None) -> dict:
        return self._send("GET", path, account, None, None)
