"""The troop's account rules, kept on the troop document under `accounts`. No Firestore calls here.

The committee had not chosen these yet, so the defaults are the cautious ones: fundraiser profit stays with the troop
(0% credit), balances never go below zero (a charge larger than the credit stays open), and a Scout who leaves has
their balance moved to the troop's general fund. Credit is never paid out as cash; there is no setting for that.
"""

from __future__ import annotations

from handlers.campaigns import DEFAULT_RULE, parse_rule
from handlers.membership import InvalidInput

LEAVING = ("general", "sibling")
POLICY_LEN = 600
DEFAULTS = {
    "allowNegative": False,
    "defaultRule": DEFAULT_RULE,
    "creditPolicy": "",
    "leavingDefault": "general",
    # Card payments (used only when PAYMENTS_MODE is on): add Stripe's fee for the family to pay, and let families pay
    # any amount toward the balance instead of only open charges. Both off until the treasurer turns them on.
    "cardFee": False,
    "allowPrepay": False,
}


def _optional_bool(data: dict, key: str, message: str) -> bool:
    value = data.get(key, False)
    if not isinstance(value, bool):
        raise InvalidInput(message)
    return value


def settings_of(troop_doc: dict | None) -> dict:
    """The troop's settings with defaults filled in for anything not chosen yet."""
    saved = (troop_doc or {}).get("accounts") or {}
    return {**DEFAULTS, **{k: v for k, v in saved.items() if k in DEFAULTS}}


def parse_settings(data: dict) -> dict:
    allow = data.get("allowNegative")
    if not isinstance(allow, bool):
        raise InvalidInput("Choose whether a balance may go below zero.")
    leaving = data.get("leavingDefault")
    if leaving not in LEAVING:
        raise InvalidInput("Choose what happens to a balance when a Scout leaves.")
    policy = str(data.get("creditPolicy") or "").strip()
    if len(policy) > POLICY_LEN:
        raise InvalidInput(f"What credit can pay for must be {POLICY_LEN} characters or fewer.")
    card_fee = _optional_bool(data, "cardFee", "Choose whether to add the card processing fee.")
    prepay = _optional_bool(data, "allowPrepay", "Choose whether families may pay toward the balance.")
    return {
        "allowNegative": allow,
        "defaultRule": parse_rule(data.get("defaultRule")),
        "creditPolicy": policy,
        "leavingDefault": leaving,
        "cardFee": card_fee,
        "allowPrepay": prepay,
    }
