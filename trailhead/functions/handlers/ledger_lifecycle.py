"""Scout accounts over time: settling when a Scout leaves, anonymizing on removal, and the 7-year retention rule.
No Firestore calls here.

- Leaving: the balance moves to the troop's general fund (the default) or to a sibling's account. It is never paid
  out. Open charges stay on the account until a family pays or the treasurer reverses them.
- Removal (`erase_scout`): any balance left goes to the general fund, then every entry is kept but re-keyed to a
  reference account (`former-{ref}`), and the Scout's name is replaced with "Former Scout {ref}" in descriptions.
- Retention: an entry is deleted 7 years after its date. If the account still has newer entries, entries that
  bring the old total forward are posted, so the balance and open charges do not change.
"""

from __future__ import annotations

import re
from datetime import date

from handlers.ledger import ADJUSTMENT, CHARGE, GENERAL_FUND, PAYMENT, TRANSFER, AccountState, compute_account
from handlers.membership import InvalidInput
from handlers.retention import add_months

LEDGER_MONTHS = 7 * 12
FORMER_PREFIX = "former-"


def settlement_entries(state: AccountState, scout_id: str, to: str, sibling_id: str | None, transfer_id: str):
    """(entries to post) moving the whole balance out of the account. Empty when the balance is zero."""
    amount = state.balance
    if amount == 0:
        return []
    if to == "sibling":
        if not sibling_id:
            raise InvalidInput("Choose the sibling who gets this balance.")
        if amount < 0:
            raise InvalidInput("A balance below zero can't move to a sibling. Move it to the general fund instead.")
        target, out_words, in_words = sibling_id, "Balance moved to a sibling's account", "Balance from a sibling"
    elif to == "general":
        target, out_words, in_words = GENERAL_FUND, "Balance moved to the troop's general fund", "Balance from a Scout"
    else:
        raise InvalidInput("Choose where the balance goes: the troop's general fund or a sibling.")
    base = {"type": TRANSFER, "transferId": transfer_id}
    return [
        {**base, "scoutId": scout_id, "amountCents": -amount, "description": out_words},
        {**base, "scoutId": target, "amountCents": amount, "description": in_words},
    ]


def former_id(ref: str) -> str:
    return f"{FORMER_PREFIX}{ref}"


def is_former(account_id: str) -> bool:
    return account_id.startswith(FORMER_PREFIX)


def scrub(text: str, name: str, label: str) -> str:
    """Replace the Scout's full name, then each part of it, with `label` (whole words, any case)."""
    if not text or not name.strip():
        return text
    parts = [name.strip(), *[p for p in name.split() if len(p) >= 2]]
    for part in dict.fromkeys(parts):
        text = re.sub(rf"(?<!\w){re.escape(part)}(?!\w)", label, text, flags=re.IGNORECASE)
    return text


def anonymized(entry: dict, ref: str, name: str) -> dict:
    """The fields to change on one of a removed Scout's entries."""
    label = f"Former Scout {ref}"
    fields = {"scoutId": former_id(ref), "scoutRef": ref, "anonymized": True}
    for key in ("description", "reason"):
        if entry.get(key):
            fields[key] = scrub(entry[key], name, label)
    return fields


def entry_date(entry: dict) -> date | None:
    try:
        return date.fromisoformat(str(entry.get("date"))[:10])
    except ValueError:
        return None


def entry_due(entry: dict, today: date) -> bool:
    day = entry_date(entry)
    return day is not None and add_months(day, LEDGER_MONTHS) <= today


def ledger_cutoff(today: date) -> str:
    """An ISO date later than every due entry's date, for a Firestore `<` filter on `date`."""
    start = add_months(today, -LEDGER_MONTHS)  # due entries are dated on or before this; `entry_due` decides
    return date.fromordinal(start.toordinal() + 2).isoformat()


def plan_purge(account_id: str, entries: dict[str, dict], today: date) -> tuple[list[str], list[dict]]:
    """(entry ids to delete, entries to post) for one account. The posted entries keep the balance and the open
    charges exactly as they were.

    Each brought-forward entry lists the ids it `replaces`, and `compute_account` leaves those out, so a run that
    fails between posting and deleting is safe to repeat: the next run plans no second carry for them.
    """
    due = sorted(i for i, e in entries.items() if entry_due(e, today))
    if not due:
        return [], []
    replaced = {i for e in entries.values() for i in e.get("replaces") or []}
    fresh = [i for i in due if i not in replaced]
    before = compute_account(entries)
    after = compute_account({i: e for i, e in entries.items() if i not in due})
    # Deleting an old payment can make a newer charge look owed again; a payment brought forward covers it.
    covers = {c: cents - before.owed.get(c, 0) for c, cents in after.owed.items() if cents > before.owed.get(c, 0)}
    paid = sum(covers.values())
    open_carry = before.open_cents - (after.open_cents - paid)
    net_carry = before.net - (after.net + paid - open_carry)
    year = max(entry_date(entries[i]) for i in due).year + 1
    note = f"brought forward from entries before {year}"
    base = {"scoutId": account_id, "broughtForward": True, "replaces": fresh}
    carry = []
    if net_carry:
        carry.append({**base, "type": ADJUSTMENT, "amountCents": net_carry, "description": f"Balance {note}"})
    if open_carry > 0:
        charge = {"type": CHARGE, "amountCents": -open_carry, "fromCredit": False}
        carry.append({**base, **charge, "description": f"Open charges {note}"})
    if paid:
        payment = {"type": PAYMENT, "method": "other", "amountCents": paid, "covers": covers}
        carry.append({**base, **payment, "description": f"Payments {note}"})
    return due, carry
