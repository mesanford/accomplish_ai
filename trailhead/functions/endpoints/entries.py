"""Recording a family's payment, reversing a wrong entry, and settling the account of a Scout who left."""

from __future__ import annotations

import logging
import uuid

from firebase_functions import https_fn

from endpoints.money import bad, post, require_treasurer, roster_scouts
from fb import fail, troop
from handlers.ledger import compute_account, parse_day, payment_entry, reversal_entry
from handlers.ledger_lifecycle import is_former, settlement_entries
from handlers.membership import InvalidInput
from handlers.retention import today_local

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


def _account_id(data: dict) -> str:
    value = data.get("scoutId")
    if not isinstance(value, str) or not value:
        raise fail(Code.INVALID_ARGUMENT, "Choose a Scout.")
    return value


@https_fn.on_call()
def record_payment(req: https_fn.CallableRequest) -> dict:
    """The treasurer records cash, a check or another payment the troop received, or pays open charges from
    account credit. `chargeIds` are the open charges it covers, in order. Forthright never handles the money."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_treasurer(req, troop_id)
    scout_id = _account_id(data)
    t = troop(troop_id)

    def build(tx, settings, entries):
        roster_scouts(tx, t, [scout_id])
        state = compute_account(entries[scout_id])
        return [payment_entry(state, scout_id, data, settings["allowNegative"])]

    try:
        day = parse_day(data.get("date"), today_local())
        [(entry_id, entry)] = post(troop_id, [scout_id], build, req.auth.uid, day)
    except InvalidInput as err:
        raise bad(err) from err
    log.info("payment recorded troop=%s method=%s", troop_id, entry["method"])
    return {"entryId": entry_id, "coveredCents": sum(entry["covers"].values())}


@https_fn.on_call()
def reverse_entry(req: https_fn.CallableRequest) -> dict:
    """The treasurer reverses an entry with a reason. Nothing is edited or deleted: a correcting entry is added."""
    data = req.data or {}
    troop_id, entry_id = data.get("troopId"), data.get("entryId")
    require_treasurer(req, troop_id)
    if not isinstance(entry_id, str) or not entry_id:
        raise fail(Code.INVALID_ARGUMENT, "Choose an entry.")
    original = troop(troop_id).collection("ledger").document(entry_id).get().to_dict()
    if original is None:
        raise fail(Code.NOT_FOUND, "That entry isn't in the ledger.")
    account_id = original["scoutId"]

    def build(tx, settings, entries):
        return [reversal_entry(entries[account_id], entry_id, data.get("reason"))]

    try:
        [(new_id, _)] = post(troop_id, [account_id], build, req.auth.uid)
    except InvalidInput as err:
        raise bad(err) from err
    log.info("entry reversed troop=%s", troop_id)
    return {"entryId": new_id}


def settle(troop_id: str, scout_id: str, to: str, sibling_id: str | None, created_by: str | None) -> int:
    """Move the Scout's whole balance to the general fund or a sibling. Returns the cents moved (0: nothing to do)."""
    t = troop(troop_id)

    def build(tx, settings, entries):
        if to == "sibling":
            scouts = roster_scouts(tx, t, [scout_id, sibling_id] if sibling_id else [scout_id])
            family = set(scouts[scout_id].get("guardianIds") or [])
            shared = sibling_id and family & set(scouts[sibling_id].get("guardianIds") or [])
            if sibling_id == scout_id or not shared:
                raise InvalidInput("Choose a sibling: a Scout in the troop with the same parent on the app.")
        state = compute_account(entries[scout_id])
        return settlement_entries(state, scout_id, to, sibling_id, uuid.uuid4().hex)

    written = post(troop_id, [scout_id], build, created_by)
    return written[0][1]["amountCents"] * -1 if written else 0


@https_fn.on_call()
def settle_account(req: https_fn.CallableRequest) -> dict:
    """The treasurer settles a Scout's balance when they leave: `to` is "general" or "sibling" (with `siblingId`).
    The balance is never paid out as cash."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_treasurer(req, troop_id)
    scout_id = _account_id(data)
    if is_former(scout_id):
        raise fail(Code.INVALID_ARGUMENT, "This account belongs to a Scout who was removed. It is already settled.")
    if data.get("to") not in ("general", "sibling"):
        raise fail(Code.INVALID_ARGUMENT, "Choose where the balance goes: the troop's general fund or a sibling.")
    sibling = data.get("siblingId") if isinstance(data.get("siblingId"), str) else None
    try:
        moved = settle(troop_id, scout_id, data.get("to"), sibling, req.auth.uid)
    except InvalidInput as err:
        raise bad(err) from err
    log.info("account settled troop=%s to=%s", troop_id, data.get("to"))
    return {"movedCents": moved}
