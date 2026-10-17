"""Fundraiser campaigns and their credit rules. No Firestore calls here.

A campaign (`troops/{t}/campaigns/{campaignId}`) holds each Scout's sales while it is open. Posting it credits each
Scout's account by the campaign's rule and closes it; after that, a wrong credit is fixed with a reversal.

Rules: "percent" (value in basis points, so 3000 is 30%), "perItem" (value in cents per item sold) or "none". A rule
of 0% or "none" credits nobody: all the profit stays with the troop.
"""

from __future__ import annotations

from handlers.ledger import MAX_CENTS, MAX_SCOUTS, SALE, parse_text
from handlers.membership import InvalidInput

RULE_KINDS = ("percent", "perItem", "none")
MAX_BPS = 10_000
MAX_PER_ITEM = 10_000  # $100 per item
MAX_ITEMS = 10_000
NAME_LEN = 80
DEFAULT_RULE = {"kind": "percent", "value": 0}


def parse_rule(value) -> dict:
    rule = value if isinstance(value, dict) else {}
    kind, amount = rule.get("kind"), rule.get("value", 0)
    if kind not in RULE_KINDS:
        raise InvalidInput("Choose a credit rule: a percentage of sales, an amount per item, or none.")
    if kind == "none":
        return {"kind": "none", "value": 0}
    top = MAX_BPS if kind == "percent" else MAX_PER_ITEM
    if type(amount) is not int or not 0 <= amount <= top:
        raise InvalidInput(
            "The percentage must be from 0 to 100." if kind == "percent" else "The amount per item must be $0 to $100."
        )
    return {"kind": kind, "value": amount}


def credit_for(rule: dict, sales_cents: int, items: int) -> int:
    """The Scout's credit for their sales. Percentages round half a cent up."""
    if rule["kind"] == "percent":
        return (sales_cents * rule["value"] + MAX_BPS // 2) // MAX_BPS
    if rule["kind"] == "perItem":
        return items * rule["value"]
    return 0


def _whole(value, label: str, top: int) -> int:
    if value in (None, ""):
        return 0
    if type(value) is not int or not 0 <= value <= top:
        raise InvalidInput(f"{label} must be a whole number from 0 to {top:,}.")
    return value


def parse_sales(value, scout_ids: set[str]) -> dict[str, dict]:
    """Scout id -> {salesCents, items}. Rows with nothing sold are dropped."""
    rows = value if isinstance(value, dict) else {}
    if len(rows) > MAX_SCOUTS:
        raise InvalidInput(f"A campaign can list up to {MAX_SCOUTS} Scouts.")
    sales = {}
    for scout_id, row in rows.items():
        if scout_id not in scout_ids:
            raise InvalidInput("Sales can only be entered for Scouts on the roster.")
        row = row if isinstance(row, dict) else {}
        cents = _whole(row.get("salesCents"), "Sales in cents", MAX_CENTS)
        items = _whole(row.get("items"), "Items sold", MAX_ITEMS)
        if cents or items:
            sales[scout_id] = {"salesCents": cents, "items": items}
    return sales


def parse_campaign(data: dict, scout_ids: set[str]) -> dict:
    return {
        "name": parse_text(data.get("name"), "Campaign name", NAME_LEN),
        "rule": parse_rule(data.get("rule")),
        "sales": parse_sales(data.get("sales"), scout_ids),
    }


def campaign_totals(rule: dict, sales: dict[str, dict]) -> dict:
    """Totals the campaign page shows: all sales, the Scouts' credit and what the troop keeps of the sales."""
    total = sum(r["salesCents"] for r in sales.values())
    credit = sum(credit_for(rule, r["salesCents"], r["items"]) for r in sales.values())
    return {"salesCents": total, "creditCents": credit, "troopCents": total - credit}


def sale_entries(campaign_id: str, campaign: dict) -> list[dict]:
    """One sale credit per Scout whose credit is more than zero."""
    rule, name = campaign["rule"], campaign["name"]
    entries = []
    for scout_id in sorted(campaign.get("sales") or {}):
        row = campaign["sales"][scout_id]
        credit = credit_for(rule, row["salesCents"], row["items"])
        if credit > 0:
            entries.append(
                {
                    "scoutId": scout_id,
                    "type": SALE,
                    "amountCents": credit,
                    "campaignId": campaign_id,
                    "description": f"{name}: credit on sales of ${row['salesCents'] / 100:,.2f}",
                }
            )
    return entries
