"""Scout accounts: who may touch money, and the one transactional path every ledger write takes.

The security rules refuse every client write to `ledger`, `accounts` and `campaigns`, so these server functions are
the only writers. Each post reads the affected accounts' entries inside a transaction, appends the new entries and
rewrites each account's cached totals from the full set, so the cache always matches the entries.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import db, fail, kind_blocker, require_access, troop
from handlers.account_settings import settings_of
from handlers.ledger import MAX_SCOUTS, account_doc, compute_account
from handlers.membership import InvalidInput
from handlers.retention import today_local

Code = https_fn.FunctionsErrorCode
TREASURER = "treasurer"
# Who sees every account and the troop summary. Only the treasurer changes anything.
MONEY_VIEWERS = {TREASURER, "scoutmaster", "advancement"}
SYSTEM_NAME = "Forthright"

Build = Callable[[object, dict, dict[str, dict[str, dict]]], list[dict]]


def can_see_money(access: dict) -> bool:
    return bool(MONEY_VIEWERS & set(access.get("roles", [])))


def require_treasurer(req: https_fn.CallableRequest, troop_id: str | None) -> dict:
    access = require_access(req, troop_id)
    if TREASURER not in access.get("roles", []):
        raise fail(Code.PERMISSION_DENIED, "Only the troop treasurer can change Scout accounts.")
    return access


def bad(err: InvalidInput) -> https_fn.HttpsError:
    return fail(Code.INVALID_ARGUMENT, str(err))


def name_of(t, uid: str | None) -> str:
    """The display name stored on an entry for who recorded it."""
    if not uid:
        return SYSTEM_NAME
    access = t.collection("access").document(uid).get().to_dict() or {}
    member = t.collection("members").document(access.get("memberId") or "-").get().to_dict() or {}
    return member.get("displayName") or "Troop member"


def roster_scouts(tx, t, scout_ids: list[str]) -> dict[str, dict]:
    """The members for these ids, refusing any that is not a Scout on the roster."""
    if not scout_ids:
        raise InvalidInput("Choose at least one Scout.")
    if len(scout_ids) > MAX_SCOUTS:
        raise InvalidInput(f"Post to {MAX_SCOUTS} Scouts or fewer at a time.")
    found = {}
    for scout_id in scout_ids:
        member = t.collection("members").document(scout_id).get(transaction=tx).to_dict()
        if member is None or member.get("kind") != "scout":
            raise InvalidInput("Choose Scouts who are on the roster.")
        found[scout_id] = member
    return found


def clean_ids(value) -> list[str]:
    return list(dict.fromkeys(v for v in (value or []) if isinstance(v, str) and v))


def post(
    troop_id: str,
    account_ids: list[str],
    build: Build,
    created_by: str | None,
    day: date | None = None,
    after: Callable[[object, list], None] | None = None,
) -> list:
    """Run `build(tx, settings, entries by account)` in a transaction and append what it returns.

    `build` may read (it runs before any write) and returns entries without dates or authors. Returns
    [(entry id, entry)] in order. Accounts not in `account_ids` that a built entry names are read too.
    `after(tx, written)` may add its own writes to the same transaction (card payments mark their record paid).
    """
    t = troop(troop_id)
    author = name_of(t, created_by)
    stamp = (day or today_local()).isoformat()

    def entries_for(tx, account_id: str) -> dict[str, dict]:
        query = t.collection("ledger").where("scoutId", "==", account_id)
        return {d.id: d.to_dict() for d in query.get(transaction=tx)}

    @firestore.transactional
    def run(tx) -> list:
        settings = settings_of(t.get(transaction=tx).to_dict())
        entries = {a: entries_for(tx, a) for a in dict.fromkeys(account_ids)}
        new = build(tx, settings, entries)
        if (
            created_by
        ):  # a person is posting (not Stripe or the nightly job): no new entries for a Scout awaiting consent
            for account_id in dict.fromkeys(e["scoutId"] for e in new):
                member = t.collection("members").document(account_id).get(transaction=tx).to_dict()
                consent = t.collection("consents").document(account_id).get(transaction=tx).to_dict()
                if reason := kind_blocker(member, consent, "accounts"):
                    raise InvalidInput(reason)
        for e in new:
            if e["scoutId"] not in entries:
                entries[e["scoutId"]] = entries_for(tx, e["scoutId"])
        written = []
        for e in new:
            ref = t.collection("ledger").document()
            full = {"date": stamp, **e, "createdBy": created_by or "system", "createdByName": author}
            tx.set(ref, {**full, "createdAt": firestore.SERVER_TIMESTAMP})
            entries[e["scoutId"]][ref.id] = full
            written.append((ref.id, full))
        for account_id in dict.fromkeys(e["scoutId"] for e in new):
            state = compute_account(entries[account_id])
            doc = account_doc(account_id, state, len(entries[account_id]))
            tx.set(t.collection("accounts").document(account_id), {**doc, "updatedAt": firestore.SERVER_TIMESTAMP})
        if after:
            after(tx, written)
        return written

    return run(db().transaction())
