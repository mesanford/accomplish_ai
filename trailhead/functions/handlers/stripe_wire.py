"""Stripe on the wire, without the `stripe` package: form encoding for requests and webhook signature checks.

Stripe signs each webhook with `Stripe-Signature: t=<unix time>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. A
signature is good when one of its v1 values matches (compared in constant time) and the timestamp is within five
minutes of now, so an old delivery can't be replayed.
"""

from __future__ import annotations

import hashlib
import hmac
from urllib.parse import quote

TOLERANCE_SEC = 300


class BadSignature(Exception):
    """The webhook did not come from Stripe, or came too long ago."""


def form_encode(params: dict) -> str:
    """Stripe's form encoding: nested maps as `a[b]=v`, lists as `a[0]=v` or `a[0][b]=v`, booleans as true/false."""
    pairs: list[tuple[str, str]] = []

    def walk(prefix: str, value) -> None:
        if value is None:
            return
        if isinstance(value, dict):
            for k, v in value.items():
                walk(f"{prefix}[{k}]" if prefix else str(k), v)
        elif isinstance(value, list | tuple):
            for i, v in enumerate(value):
                walk(f"{prefix}[{i}]", v)
        elif isinstance(value, bool):
            pairs.append((prefix, "true" if value else "false"))
        else:
            pairs.append((prefix, str(value)))

    walk("", params)
    return "&".join(f"{quote(k, safe='[]')}={quote(v, safe='')}" for k, v in pairs)


def parse_header(header: str | None) -> tuple[int | None, list[str]]:
    """(timestamp, v1 signatures) from a Stripe-Signature header."""
    stamp, sigs = None, []
    for part in (header or "").split(","):
        key, _, value = part.strip().partition("=")
        if key == "t" and value.isdigit():
            stamp = int(value)
        elif key == "v1" and value:
            sigs.append(value)
    return stamp, sigs


def sign(payload: bytes, secret: str, stamp: int) -> str:
    """The v1 signature Stripe would send. Tests use it to make good and bad deliveries."""
    signed = f"{stamp}.".encode() + payload
    return hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()


def verify(payload: bytes, header: str | None, secret: str | None, now: int, tolerance: int = TOLERANCE_SEC) -> None:
    """Raise BadSignature unless the payload carries a good, recent signature for `secret`."""
    if not secret:
        raise BadSignature("no webhook secret is set")
    stamp, sigs = parse_header(header)
    if stamp is None or not sigs:
        raise BadSignature("no signature")
    if abs(now - stamp) > tolerance:
        raise BadSignature("signature is too old")
    expected = sign(payload, secret, stamp)
    if not any(hmac.compare_digest(expected, s) for s in sigs):
        raise BadSignature("signature does not match")
