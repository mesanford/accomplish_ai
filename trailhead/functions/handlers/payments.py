"""Card payments: the money math and the ledger entries a card payment or refund posts. No Firestore or HTTP here.

Families pay a Scout's open charges (or, if the troop allows it, any amount toward the balance) through Stripe-hosted
Checkout on the troop's own Stripe account. Forthright never holds the money and takes no fee of its own. The server
works out every amount from the ledger; nothing the browser sends is trusted as a price.

A payment record (`troops/{t}/payments/{paymentId}`) follows one Checkout Session:
  open -> paid | processing -> paid | failed | expired, and later refunded / partially_refunded or disputed.
`amountCents` is what goes on the Scout's account; `feeCents` is the card fee line, if the troop adds it, which pays
Stripe and never reaches the account; `totalCents` is what the card is charged.
"""

from __future__ import annotations

import re

from handlers.ledger import ADJUSTMENT, MAX_CENTS, PAYMENT, AccountState, parse_cents, reversal_entry
from handlers.membership import InvalidInput

MODES = ("off", "test", "live")
PLATFORM_FEE_CENTS = 0  # Forthright takes nothing from a family's payment. Kept as a constant so it is never implied.
FEE_PERCENT_TENTHS = 29  # Stripe's US standard card rate: 2.9% ...
FEE_FIXED_CENTS = 30  # ... plus 30 cents
MIN_CENTS = 50  # Stripe's smallest US card charge
MAX_CHARGES = 20  # charge ids must fit in Stripe's 500-character metadata value
CARD = "card"
REFUND_REASON = "Card refund"
OPEN, PROCESSING, PAID, FAILED, EXPIRED = "open", "processing", "paid", "failed", "expired"
REFUNDED, PARTIAL, REVIEW = "refunded", "partially_refunded", "review"
DAILY_SESSIONS = 10  # Checkout Sessions one person may start in a day


def payments_mode(value) -> str:
    """PAYMENTS_MODE: "test" or "live" turn card payments on. Anything else, including unset, is "off"."""
    mode = str(value or "").strip().lower()
    return mode if mode in ("test", "live") else "off"


def key_matches_mode(key: str | None, mode: str) -> bool:
    """A test key in test mode and a live key in live mode, so a test setup can never take real money by mistake."""
    if not key or mode not in ("test", "live"):
        return False
    return any(key.startswith(f"{kind}_{mode}_") for kind in ("sk", "rk"))


def stripe_fee(total_cents: int) -> int:
    """What Stripe keeps from a US card charge at the standard rate, rounded to the nearest cent."""
    return (total_cents * FEE_PERCENT_TENTHS + 500) // 1000 + FEE_FIXED_CENTS


def gross_up(base_cents: int) -> int:
    """The smallest card total that leaves the troop at least `base_cents` after Stripe's standard fee."""
    total = -(-(base_cents + FEE_FIXED_CENTS) * 1000 // (1000 - FEE_PERCENT_TENTHS))
    while total - 1 - stripe_fee(total - 1) >= base_cents:
        total -= 1
    while total - stripe_fee(total) < base_cents:
        total += 1
    return total


def fee_for(base_cents: int, add_fee: bool) -> int:
    """The card processing fee line: 0 unless the troop chose to add it."""
    return gross_up(base_cents) - base_cents if add_fee else 0


def choose_charges(state: AccountState, charge_ids) -> dict[str, int]:
    """The chosen open charges and what each still owes, in the order chosen. Refuses anything not open."""
    if not isinstance(charge_ids, list) or not all(isinstance(c, str) and c for c in charge_ids):
        raise InvalidInput("Choose the charges to pay.")
    ids = list(dict.fromkeys(charge_ids))
    if not ids:
        raise InvalidInput("Choose the charges to pay.")
    if len(ids) > MAX_CHARGES:
        raise InvalidInput(f"Pay {MAX_CHARGES} charges or fewer at a time.")
    if any(c not in state.owed for c in ids):
        raise InvalidInput("One of the chosen charges is not open any more. Reload the page and try again.")
    return {c: state.owed[c] for c in ids}


def checkout_amount(state: AccountState, data: dict, allow_prepay: bool) -> tuple[list[str], int]:
    """(charge ids, cents for the Scout's account) from what the family picked. Either open charges or, if the troop
    allows prepaying, an amount toward the balance. The amount is always worked out here, never taken from charges."""
    if data.get("chargeIds"):
        chosen = choose_charges(state, data.get("chargeIds"))
        amount = sum(chosen.values())
        ids = list(chosen)
    else:
        if not allow_prepay:
            raise InvalidInput("Choose the open charges to pay.")
        amount = parse_cents(data.get("amountCents"))
        ids = []
    if amount < MIN_CENTS:
        raise InvalidInput("Online payments must be $0.50 or more.")
    if amount > MAX_CENTS:
        raise InvalidInput("Pay $10,000.00 or less at a time.")
    return ids, amount


def troop_label(troop_doc: dict | None) -> str:
    """'Troop 101', from the unit number only. Never a Scout's name."""
    unit = re.sub(r"[^0-9A-Za-z-]", "", str((troop_doc or {}).get("unitNumber") or ""))[:10]
    return f"Troop {unit}" if unit else "Troop"


def description(troop_doc: dict | None, charge_ids: list[str]) -> str:
    """The generic line a family's card statement and receipt show. No Scout name, no event titles."""
    what = "activity fees" if charge_ids else "Scout account payment"
    return f"{troop_label(troop_doc)} {what}"


FEE_LINE = "Card processing fee (2.9% + 30¢, added by the troop)"


def _item(name: str, cents: int) -> dict:
    return {"quantity": 1, "price_data": {"currency": "usd", "unit_amount": cents, "product_data": {"name": name}}}


def line_items(desc: str, amount: int, fee: int) -> list[dict]:
    """One generic line for the troop, and a clearly labeled fee line when the troop adds it."""
    return [_item(desc, amount), _item(FEE_LINE, fee)] if fee else [_item(desc, amount)]


def session_params(record: dict, payment_id: str, troop_id: str, urls: dict, expires_at: int) -> dict:
    """The form fields for `POST /v1/checkout/sessions` on the troop's connected account (a direct charge)."""
    desc = record["description"]
    metadata = {
        "troopId": troop_id,
        "scoutId": record["scoutId"],
        "paymentId": payment_id,
        "chargeIds": ",".join(record["chargeIds"]),
    }
    intent = {"description": desc, "metadata": metadata}
    if PLATFORM_FEE_CENTS:
        intent["application_fee_amount"] = PLATFORM_FEE_CENTS
    return {
        "mode": "payment",
        "payment_method_types": ["card"],
        "line_items": line_items(desc, record["amountCents"], record["feeCents"]),
        "client_reference_id": payment_id,
        "metadata": metadata,
        "payment_intent_data": intent,
        "success_url": urls["success"],
        "cancel_url": urls["cancel"],
        "expires_at": expires_at,
    }


def oldest_open(entries: dict[str, dict], state: AccountState) -> list[str]:
    return sorted(state.owed, key=lambda i: (str(entries.get(i, {}).get("date", "")), i))


def card_payment_entry(entries: dict, state: AccountState, record: dict, payment_id: str) -> dict:
    """The ledger payment for a paid Checkout Session. The money has already moved, so this never refuses: it covers
    whatever of the chosen charges is still open (or, for an amount toward the balance, the oldest open charges) and
    anything left over becomes account credit."""
    amount = int(record["amountCents"])
    chosen = record.get("chargeIds") or []
    wanted = [c for c in chosen if c in state.owed] if chosen else oldest_open(entries, state)
    covers, left = {}, amount
    for charge_id in wanted:
        take = min(state.owed[charge_id], left)
        if take > 0:
            covers[charge_id] = take
            left -= take
    return {
        "scoutId": record["scoutId"],
        "type": PAYMENT,
        "method": CARD,
        "amountCents": amount,
        "covers": covers,
        "description": "Card payment",
        "paymentId": payment_id,
    }


def refund_entries(entries: dict, record: dict, payment_id: str, refunded_cents: int) -> tuple[list[dict], int]:
    """(entries to post, ledger cents refunded so far) when Stripe reports `refunded_cents` refunded in all.

    A full refund reverses the card payment (so its charges are open again) and any partial-refund entries posted
    before it. A partial refund posts an adjustment for its share of the account amount (the card fee line is
    refunded in proportion). Repeating the same event posts nothing."""
    base, total = int(record["amountCents"]), int(record["totalCents"])
    done = int(record.get("refundedLedgerCents") or 0)
    target = base if refunded_cents >= total else refunded_cents * base // total
    if target <= done:
        return [], done
    if target == base:
        posted = [reversal_entry(entries, record["ledgerEntryId"], REFUND_REASON)]
        for adj in record.get("refundEntryIds") or []:
            if adj in entries:
                posted.append(reversal_entry(entries, adj, REFUND_REASON))
        return posted, base
    entry = {
        "scoutId": record["scoutId"],
        "type": ADJUSTMENT,
        "amountCents": -(target - done),
        "reason": REFUND_REASON,
        "description": "Card refund (part of a card payment)",
        "paymentId": payment_id,
    }
    return [entry], target
