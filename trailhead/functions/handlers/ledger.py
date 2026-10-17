"""Scout accounts: the ledger's math. No Firestore calls here.

The ledger (`troops/{t}/ledger/{entryId}`) is append-only. An entry is never edited or deleted by a person; a mistake
gets a reversal that points at it. Amounts are whole US cents: credit is positive, a charge is negative.

Two numbers describe an account, both computed from its entries:
- `balanceCents`: the Scout's account credit. A charge paid from credit lowers it; an open charge does not.
- `openChargesCents`: what the family still owes on charges left open.

`net` (the plain sum of every entry) is balance minus open charges. A charge left open still adds its negative
amount to `net`, which is why it shows up in `openChargesCents` instead of in the balance. A payment of cash or a
check adds its amount and covers open charges (`covers`: charge id to cents). Paying an open charge from credit is a
payment with method "credit": its amount is zero and it only covers charges, so the balance drops by what it covers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from handlers.membership import InvalidInput

SALE, CHARGE, PAYMENT, ADJUSTMENT, TRANSFER = "sale", "charge", "payment", "adjustment", "transfer"
TYPES = (SALE, CHARGE, PAYMENT, ADJUSTMENT, TRANSFER)
METHODS = ("cash", "check", "other", "credit")
GENERAL_FUND = "troop-fund"  # the troop's own account, where unspent credit goes when a Scout leaves
MAX_CENTS = 1_000_000  # $10,000: far above any troop charge, and stops a typo of extra zeros
MAX_SCOUTS = 200  # each Scout is two writes; Firestore allows 500 in one transaction
DESCRIPTION_LEN = 120
REASON_LEN = 200


@dataclass
class AccountState:
    net: int = 0
    owed: dict[str, int] = field(default_factory=dict)  # open charge id -> cents still owed
    reversed_ids: set[str] = field(default_factory=set)

    @property
    def open_cents(self) -> int:
        return sum(self.owed.values())

    @property
    def balance(self) -> int:
        return self.net + self.open_cents


def compute_account(entries: dict[str, dict]) -> AccountState:
    """The account's state from all of its entries. Allocations to charges that are missing (deleted by the 7-year
    retention rule) or reversed are ignored; the payment's amount still counts. Entries a brought-forward entry
    `replaces` are left out, so the total is right even before the retention job has deleted them."""
    replaced = {i for e in entries.values() for i in e.get("replaces") or []}
    entries = {i: e for i, e in entries.items() if i not in replaced}
    reversed_ids = {e["reverses"] for e in entries.values() if e.get("reverses")}
    net = sum(int(e.get("amountCents", 0)) for e in entries.values())
    owed = {
        entry_id: -int(e["amountCents"])
        for entry_id, e in entries.items()
        if e.get("type") == CHARGE and not e.get("fromCredit") and entry_id not in reversed_ids
    }
    for entry_id, e in entries.items():
        if e.get("type") != PAYMENT or entry_id in reversed_ids:
            continue
        for charge_id, cents in (e.get("covers") or {}).items():
            if charge_id in owed:
                owed[charge_id] = max(owed[charge_id] - int(cents), 0)
    return AccountState(net=net, owed={k: v for k, v in owed.items() if v > 0}, reversed_ids=reversed_ids)


def account_doc(account_id: str, state: AccountState, entry_count: int) -> dict:
    """The cached totals on `troops/{t}/accounts/{scoutId}`, rewritten from every entry on each post."""
    return {
        "scoutId": account_id,
        "balanceCents": state.balance,
        "openChargesCents": state.open_cents,
        "openChargeCount": len(state.owed),
        "entryCount": entry_count,
    }


def parse_cents(value, label: str = "Amount", allow_zero: bool = False) -> int:
    if type(value) is not int:  # bool is an int subclass; refuse it too
        raise InvalidInput(f"{label} must be a whole number of cents.")
    if value < 0 or (value == 0 and not allow_zero):
        raise InvalidInput(f"{label} must be more than $0.00.")
    if value > MAX_CENTS:
        raise InvalidInput(f"{label} must be $10,000.00 or less.")
    return value


def parse_text(value, label: str, max_len: int) -> str:
    text = " ".join(str(value or "").split())
    if not text:
        raise InvalidInput(f"{label} is required.")
    if len(text) > max_len:
        raise InvalidInput(f"{label} must be {max_len} characters or fewer.")
    return text


def charge_from_credit(state: AccountState, amount: int, pay_from: str, allow_negative: bool) -> bool:
    """True when the charge is paid from account credit now, False when it stays open for the family to pay.
    "credit" means "from credit where there is enough": with balances allowed below zero, always from credit."""
    if pay_from == "open":
        return False
    if pay_from != "credit":
        raise InvalidInput("Choose to pay from account credit or leave the charge open.")
    return allow_negative or state.balance >= amount


def charge_entry(scout_id: str, amount: int, description: str, from_credit: bool, event_id: str | None) -> dict:
    entry = {"scoutId": scout_id, "type": CHARGE, "amountCents": -amount, "description": description}
    entry["fromCredit"] = from_credit
    if event_id:
        entry["eventId"] = event_id
    return entry


def already_charged(entries: dict[str, dict], event_id: str, description: str) -> bool:
    """A charge for this event with the same description is already on the account (and not reversed)."""
    state = compute_account(entries)
    return any(
        e.get("type") == CHARGE and e.get("eventId") == event_id and e.get("description") == description
        for entry_id, e in entries.items()
        if entry_id not in state.reversed_ids
    )


def allocate(state: AccountState, amount: int, charge_ids: list[str]) -> dict[str, int]:
    """Spread a payment over the chosen open charges in order, never more than each one owes."""
    covers, left = {}, amount
    for charge_id in dict.fromkeys(charge_ids):
        if charge_id not in state.owed:
            raise InvalidInput("One of the chosen charges is not open. Reload the page and try again.")
        take = min(state.owed[charge_id], left)
        if take > 0:
            covers[charge_id] = take
            left -= take
    return covers


def payment_entry(state: AccountState, scout_id: str, data: dict, allow_negative: bool) -> dict:
    """A recorded payment. Cash, a check or "other" adds to the account and covers the chosen charges; anything left
    over becomes credit. "credit" uses account credit to cover open charges and adds nothing."""
    method = data.get("method")
    if method not in METHODS:
        raise InvalidInput("Choose how the family paid: cash, check, other or account credit.")
    amount = parse_cents(data.get("amountCents"))
    charge_ids = [c for c in data.get("chargeIds") or [] if isinstance(c, str)]
    covers = allocate(state, amount, charge_ids)
    note = " ".join(str(data.get("note") or "").split())[:DESCRIPTION_LEN]
    if method == "credit":
        if sum(covers.values()) != amount:
            raise InvalidInput("Account credit can only pay open charges. Choose charges that add up to the amount.")
        if not allow_negative and amount > state.balance:
            raise InvalidInput("There isn't enough account credit to pay these charges.")
    words = {"cash": "Cash payment", "check": "Check payment", "other": "Payment", "credit": "Paid from account credit"}
    entry = {
        "scoutId": scout_id,
        "type": PAYMENT,
        "method": method,
        "amountCents": 0 if method == "credit" else amount,
        "covers": covers,
        "description": f"{words[method]}: {note}" if note else words[method],
    }
    if method == "credit":
        entry["appliedCents"] = amount
    return entry


def reversal_entry(entries: dict[str, dict], entry_id: str, reason) -> dict:
    """The correcting entry for `entry_id`, which must be on this account. Needs a reason."""
    original = entries.get(entry_id)
    if original is None:
        raise InvalidInput("That entry isn't on this account.")
    if original.get("reverses"):
        raise InvalidInput("A reversal can't be reversed. Post the entry again instead.")
    if original.get("type") == TRANSFER:
        raise InvalidInput("A transfer between accounts can't be reversed here. Ask the treasurer to post a new one.")
    if entry_id in compute_account(entries).reversed_ids:
        raise InvalidInput("This entry has already been reversed.")
    why = parse_text(reason, "A reason", REASON_LEN)
    return {
        "scoutId": original["scoutId"],
        "type": ADJUSTMENT,
        "amountCents": -int(original.get("amountCents", 0)),
        "reverses": entry_id,
        "reason": why,
        "description": f"Reversal: {original.get('description', '')}"[: DESCRIPTION_LEN + 10],
    }


def parse_day(value, today: date) -> date:
    """The entry's date: today when not given, otherwise a past date within the last year (never the future)."""
    if not value:
        return today
    try:
        day = date.fromisoformat(str(value)[:10])
    except ValueError as err:
        raise InvalidInput("Enter the date as YYYY-MM-DD.") from err
    if day > today:
        raise InvalidInput("The date can't be in the future.")
    if (today - day).days > 366:
        raise InvalidInput("The date must be within the last year.")
    return day
