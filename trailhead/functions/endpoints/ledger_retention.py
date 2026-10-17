"""Keeping the books when people leave: anonymizing a removed Scout's entries, taking a deleted adult's name off
the entries they recorded, and deleting entries 7 years after their date (see `handlers/ledger_lifecycle.py`)."""

from __future__ import annotations

import logging
import secrets
from datetime import date

from firebase_admin import firestore

from endpoints.entries import settle
from endpoints.erase import commit, delete_op, update_op
from endpoints.money import post
from handlers.ledger import account_doc, compute_account
from handlers.ledger_lifecycle import anonymized, former_id, ledger_cutoff, plan_purge
from handlers.removal import chunked

log = logging.getLogger(__name__)
FORMER_MEMBER = "Former member"


def _former_ref(t, scout_id: str) -> str:
    """The Scout's reference number, made once and kept on their account so a repeated run uses the same one."""
    ref = t.collection("accounts").document(scout_id)
    saved = (ref.get().to_dict() or {}).get("formerRef")
    if saved:
        return saved
    while True:
        number = f"{secrets.randbelow(90_000_000) + 10_000_000}"
        if not t.collection("accounts").document(former_id(number)).get().exists:
            break
    ref.set({"formerRef": number}, merge=True)
    return number


def _entries(t, account_id: str) -> dict[str, dict]:
    return {d.id: d.to_dict() for d in t.collection("ledger").where("scoutId", "==", account_id).stream()}


def close_scout_account(troop_id: str, scout_id: str, t) -> int:
    """Called by `erase_scout` before the member record goes. Moves any balance to the general fund, then re-keys
    every entry to the Scout's reference account and takes their name out. Returns the entries kept."""
    entries = _entries(t, scout_id)
    account = t.collection("accounts").document(scout_id)
    if not entries:
        account.delete()
        return 0
    if compute_account(entries).balance:
        settle(troop_id, scout_id, "general", None, None)
        entries = _entries(t, scout_id)
    ref = _former_ref(t, scout_id)
    name = (t.collection("members").document(scout_id).get().to_dict() or {}).get("displayName", "")
    ops = [update_op(t.collection("ledger").document(i), anonymized(e, ref, name)) for i, e in entries.items()]
    # Recompute the reference account from every entry already moved to it, including any from an earlier run.
    moved = _entries(t, former_id(ref))
    moved |= {i: {**e, **anonymized(e, ref, name)} for i, e in entries.items()}
    summary = account_doc(former_id(ref), compute_account(moved), len(moved))
    commit(ops)
    t.collection("accounts").document(former_id(ref)).set(
        {**summary, "scoutRef": ref, "updatedAt": firestore.SERVER_TIMESTAMP}
    )
    account.delete()  # last: it holds the reference number a repeated run needs
    return len(entries)


def forget_author_ops(t, uid: str) -> list:
    """Writes that take a deleted account's name off the ledger entries it recorded. The entries stay."""
    query = t.collection("ledger").where("createdBy", "==", uid)
    fields = {"createdBy": "former-member", "createdByName": FORMER_MEMBER}
    return [update_op(d.reference, fields) for d in query.stream()]


def purge(t, troop_id: str, today: date, limit: int) -> tuple[int, int]:
    """The nightly rule: delete entries 7 years past their date, at most `limit` a night. (due, deleted)."""
    old = t.collection("ledger").where("date", "<", ledger_cutoff(today)).limit(limit)
    accounts = sorted({d.to_dict().get("scoutId") for d in old.stream()} - {None})
    due = deleted = 0
    for account_id in accounts:
        entries = _entries(t, account_id)
        drop, carry = plan_purge(account_id, entries, today)
        due += len(drop)
        # Post the brought-forward entries first: if the deletes then fail, tomorrow's run sees the old entries
        # are still due and the account already carries their total, so it plans no second carry.
        if carry:
            post(troop_id, [account_id], lambda tx, settings, found, carry=carry: carry, None, today)
        for group in chunked(drop):
            commit([delete_op(t.collection("ledger").document(i)) for i in group])
        deleted += len(drop)
        left = _entries(t, account_id)
        account = t.collection("accounts").document(account_id)
        if not left:
            account.delete()
        else:
            summary = account_doc(account_id, compute_account(left), len(left))
            account.set({**summary, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    log.info("retention rule=ledger troop=%s due=%d deleted=%d accounts=%d", troop_id, due, deleted, len(accounts))
    return due, deleted
