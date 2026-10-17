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
DEFAULTS = {"allowNegative": False, "defaultRule": DEFAULT_RULE, "creditPolicy": "", "leavingDefault": "general"}


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
    return {
        "allowNegative": allow,
        "defaultRule": parse_rule(data.get("defaultRule")),
        "creditPolicy": policy,
        "leavingDefault": leaving,
    }
