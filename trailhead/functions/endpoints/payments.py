"""Connecting a troop's own Stripe account (Stripe Connect, Standard) and telling the app whether card payments are on.

The troop, or its chartered organization, owns the Stripe account and its money; Forthright never holds funds. The
troop document keeps only `payments`: {stripeAccountId, chargesEnabled, detailsSubmitted, mode, generation, ...},
written here and by the webhook. With PAYMENTS_MODE off, every callable here refuses and the app hides payments.
"""

from __future__ import annotations

import logging
import re
import uuid

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.mailer import app_url
from endpoints.money import TREASURER, require_treasurer
from endpoints.stripe_api import Config, Stripe, StripeError, config, in_emulator
from fb import fail, require_access, troop

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode
SECRETS = ["STRIPE_SECRET_KEY"]
LOCAL_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1):\d{2,5}$")


def require_on() -> Config:
    """The payments settings, refusing when payments are off or set up wrong."""
    cfg = config()
    if not cfg.on:
        raise fail(Code.FAILED_PRECONDITION, "Online payments are not turned on.")
    if not cfg.ready:
        log.error("payments mode=%s but STRIPE_SECRET_KEY is missing or for the other mode", cfg.mode)
        raise fail(Code.FAILED_PRECONDITION, "Online payments aren't set up yet. Try again later.")
    return cfg


def connection(troop_doc: dict | None, cfg: Config) -> dict:
    """The troop's Stripe connection for the current mode, or {} (an account made in test mode is not a live one)."""
    saved = (troop_doc or {}).get("payments") or {}
    return saved if saved.get("stripeAccountId") and saved.get("mode") == cfg.mode else {}


def app_base(data: dict) -> str:
    """Where Stripe sends people back to. Always APP_URL, except a local origin while running on the emulator."""
    origin = str(data.get("origin") or "")
    if in_emulator() and LOCAL_ORIGIN.match(origin):
        return origin
    return app_url()


def account_fields(account: dict) -> dict:
    return {
        "chargesEnabled": account.get("charges_enabled") is True,
        "detailsSubmitted": account.get("details_submitted") is True,
    }


@https_fn.on_call(secrets=SECRETS)
def payments_status(req: https_fn.CallableRequest) -> dict:
    """Whether card payments are on for this troop. Any member may ask; the treasurer may `refresh` from Stripe."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    cfg = config()
    if not cfg.on:
        return {"mode": "off", "connected": False, "chargesEnabled": False}
    t = troop(troop_id)
    linked = connection(t.get().to_dict(), cfg)
    if linked and data.get("refresh") is True and TREASURER in access.get("roles", []) and cfg.ready:
        try:
            fields = account_fields(Stripe(cfg).get(f"/v1/accounts/{linked['stripeAccountId']}"))
        except StripeError:
            raise fail(Code.UNAVAILABLE, "Stripe didn't answer. Try again in a minute.") from None
        t.update({f"payments.{k}": v for k, v in fields.items()} | {"payments.updatedAt": firestore.SERVER_TIMESTAMP})
        linked = {**linked, **fields}
    return {
        "mode": cfg.mode,
        "connected": bool(linked),
        "chargesEnabled": bool(linked.get("chargesEnabled")) and cfg.ready,
    }


@https_fn.on_call(secrets=SECRETS)
def connect_stripe(req: https_fn.CallableRequest) -> dict:
    """The treasurer starts (or finishes) Stripe-hosted onboarding. Returns {url} to send the browser to."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_treasurer(req, troop_id)
    cfg = require_on()
    t = troop(troop_id)
    troop_doc = t.get().to_dict() or {}
    saved = (troop_doc.get("payments") or {}) if (troop_doc.get("payments") or {}).get("mode") == cfg.mode else {}
    generation = int(saved.get("generation") or 0)
    stripe = Stripe(cfg)
    try:
        account_id = saved.get("stripeAccountId")
        if not account_id:
            params = {"type": "standard", "country": "US", "metadata": {"troopId": troop_id}}
            account_id = stripe.post("/v1/accounts", params, idem=f"account-{troop_id}-{cfg.mode}-{generation}")["id"]
            t.update(
                {
                    "payments": {
                        "stripeAccountId": account_id,
                        "chargesEnabled": False,
                        "detailsSubmitted": False,
                        "mode": cfg.mode,
                        "generation": generation,
                        "previousAccountIds": saved.get("previousAccountIds") or [],
                        "connectedBy": req.auth.uid,
                        "connectedAt": firestore.SERVER_TIMESTAMP,
                        "updatedAt": firestore.SERVER_TIMESTAMP,
                    }
                }
            )
        back = f"{app_base(data)}/t/{troop_id}/accounts/settings"
        link = stripe.post(
            "/v1/account_links",
            {
                "account": account_id,
                "type": "account_onboarding",
                "refresh_url": f"{back}?stripe=refresh",
                "return_url": f"{back}?stripe=return",
            },
            idem=f"link-{uuid.uuid4().hex}",
        )
    except StripeError:
        raise fail(Code.UNAVAILABLE, "Stripe didn't answer. Nothing was changed. Try again in a minute.") from None
    log.info("stripe onboarding started troop=%s mode=%s", troop_id, cfg.mode)
    return {"url": link["url"]}


@https_fn.on_call()
def disconnect_stripe(req: https_fn.CallableRequest) -> dict:
    """The treasurer stops card payments. The Stripe account and its money stay the troop's; Forthright forgets the
    account id, so no new payments start. Payments already made still reconcile through the webhook."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_treasurer(req, troop_id)
    t = troop(troop_id)
    saved = (t.get().to_dict() or {}).get("payments") or {}
    if not saved.get("stripeAccountId"):
        return {"disconnected": False}
    previous = sorted({*(saved.get("previousAccountIds") or []), saved["stripeAccountId"]})
    t.update(
        {
            "payments": {
                "mode": saved.get("mode"),
                "generation": int(saved.get("generation") or 0) + 1,
                "previousAccountIds": previous,
                "disconnectedBy": req.auth.uid,
                "disconnectedAt": firestore.SERVER_TIMESTAMP,
            }
        }
    )
    log.info("stripe disconnected troop=%s", troop_id)
    return {"disconnected": True}
