"""Lending troop gear: check out, check in, requests for an event and the quartermaster's answer."""

from __future__ import annotations

import logging

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.equipment_core import Code, bad, read_recipient, require_manager, stage_checkout
from fb import db, fail, require_access, troop, troop_today
from handlers.equipment import (
    MAX_PENDING_REQUESTS,
    default_due,
    note_text,
    parse_check_in,
    parse_checkout,
    parse_day,
    parse_request,
)
from handlers.membership import InvalidInput

log = logging.getLogger(__name__)


def _id(data: dict, key: str, message: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value:
        raise fail(Code.INVALID_ARGUMENT, message)
    return value


@https_fn.on_call()
def check_out_item(req: https_fn.CallableRequest) -> dict:
    """Lend an item (or some of a quantity item) to a member or an event, with a due date. The count of items out
    changes in the same transaction, so two people can't take the last mess kit."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_manager(req, troop_id)
    item_id = _id(data, "itemId", "Choose an item.")
    try:
        terms = parse_checkout(data, troop_today(troop_id))
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    t = troop(troop_id)
    item_ref = t.collection("inventory").document(item_id)

    @firestore.transactional
    def go(tx) -> str:
        snap = item_ref.get(transaction=tx)
        recipient = read_recipient(tx, t, terms["toKind"], terms["toId"])
        if not snap.exists:
            raise InvalidInput("That item isn't in the inventory.")
        return stage_checkout(tx, t, item_ref, snap.to_dict(), terms, recipient, access["memberId"], {})

    try:
        checkout_id = go(db().transaction())
    except InvalidInput as err:
        raise bad(err) from err
    log.info("equipment out troop=%s qty=%d to=%s", troop_id, terms["quantity"], terms["toKind"])
    return {"checkoutId": checkout_id}


@https_fn.on_call()
def check_in_item(req: https_fn.CallableRequest) -> dict:
    """Take an item back, with its condition and a note. A problem is added to the item's repair log, and a single
    tracked item takes on the condition it came back in."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_manager(req, troop_id)
    checkout_id = _id(data, "checkoutId", "Choose a check-out.")
    try:
        condition, note = parse_check_in(data)
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    today = troop_today(troop_id)
    t = troop(troop_id)
    loan_ref = t.collection("checkouts").document(checkout_id)

    @firestore.transactional
    def go(tx) -> None:
        loan = loan_ref.get(transaction=tx).to_dict()
        if loan is None:
            raise InvalidInput("That check-out isn't in this troop.")
        if loan.get("status") != "out":
            raise InvalidInput("That item has already been checked in.")
        item_ref = t.collection("inventory").document(loan["itemId"])
        item = item_ref.get(transaction=tx).to_dict()
        tx.update(
            loan_ref,
            {
                "status": "returned",
                "returnedAt": firestore.SERVER_TIMESTAMP,
                "returnedById": access["memberId"],
                "returnCondition": condition,
                "returnNote": note,
            },
        )
        if item is None:
            return
        fields = {"out": max(0, int(item.get("out", 0)) - int(loan["quantity"]))}
        if condition != "good" and item.get("quantity") == 1:
            fields["condition"] = condition
        tx.update(item_ref, fields)
        if condition != "good" or note:
            text = f"Returned {loan['quantity']}, {condition.replace('_', ' ')}." + (f" {note}" if note else "")
            tx.set(
                t.collection("maintenance").document(),
                {
                    "itemId": item_ref.id,
                    "kind": "returned",
                    "note": text[:500],
                    "date": today.isoformat(),
                    "byMemberId": access["memberId"],
                    "createdAt": firestore.SERVER_TIMESTAMP,
                },
            )

    try:
        go(db().transaction())
    except InvalidInput as err:
        raise bad(err) from err
    return {"returned": True}


@https_fn.on_call()
def request_item(req: https_fn.CallableRequest) -> dict:
    """Any member asks for an item for an event. The quartermaster answers; nothing goes out until they approve."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    item_id = _id(data, "itemId", "Choose an item.")
    try:
        asked = parse_request(data)
    except InvalidInput as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from err
    if not asked["eventId"]:
        raise fail(Code.INVALID_ARGUMENT, "Choose the event this is for.")
    t = troop(troop_id)
    item = t.collection("inventory").document(item_id).get().to_dict()
    event = t.collection("events").document(asked["eventId"]).get().to_dict()
    if item is None:
        raise fail(Code.FAILED_PRECONDITION, "That item isn't in the inventory.")
    if item.get("condition") == "retired":
        raise fail(Code.FAILED_PRECONDITION, "That item is retired.")
    if event is None:
        raise fail(Code.FAILED_PRECONDITION, "That event isn't in the troop.")
    waiting = t.collection("equipmentRequests").where("requestedByUid", "==", req.auth.uid)
    mine = waiting.where("status", "==", "pending")
    if len(list(mine.limit(MAX_PENDING_REQUESTS).stream())) >= MAX_PENDING_REQUESTS:
        raise fail(Code.RESOURCE_EXHAUSTED, "You have 10 requests waiting. Wait for answers before asking for more.")
    member = t.collection("members").document(access["memberId"]).get().to_dict() or {}
    ref = t.collection("equipmentRequests").document()
    ref.set(
        {
            "itemId": item_id,
            "itemName": item["name"],
            "quantity": asked["quantity"],
            "eventId": asked["eventId"],
            "eventTitle": event.get("title", "Event"),
            "eventStart": event.get("start", ""),
            "note": asked["note"],
            "status": "pending",
            "requestedByUid": req.auth.uid,
            "requestedByMemberId": access["memberId"],
            "requestedByName": member.get("displayName", "Member"),
            "requesterKind": member.get("kind", "adult"),
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
    )
    return {"requestId": ref.id}


@https_fn.on_call()
def decide_request(req: https_fn.CallableRequest) -> dict:
    """Approve a request (which checks the item out to the event) or decline it."""
    data = req.data or {}
    troop_id = data.get("troopId")
    access = require_manager(req, troop_id)
    request_id = _id(data, "requestId", "Choose a request.")
    approve = data.get("approve")
    if not isinstance(approve, bool):
        raise fail(Code.INVALID_ARGUMENT, "Choose approve or decline.")
    today = troop_today(troop_id)
    t = troop(troop_id)
    ref = t.collection("equipmentRequests").document(request_id)

    @firestore.transactional
    def go(tx) -> str | None:
        ask = ref.get(transaction=tx).to_dict()
        if ask is None:
            raise InvalidInput("That request isn't in this troop.")
        if ask.get("status") != "pending":
            raise InvalidInput("That request has already been answered.")
        decided = {
            "decidedAt": firestore.SERVER_TIMESTAMP,
            "decidedById": access["memberId"],
            "decisionNote": note_text(data.get("note")),
        }
        if not approve:
            tx.update(ref, {"status": "declined", **decided})
            return None
        item_ref = t.collection("inventory").document(ask["itemId"])
        snap = item_ref.get(transaction=tx)
        recipient = read_recipient(tx, t, "event", ask["eventId"])
        if not snap.exists:
            raise InvalidInput("That item isn't in the inventory.")
        if data.get("dueDate"):
            day = parse_day(data["dueDate"], "The due date")
        else:
            day = default_due(recipient["event"], today)
        terms = {"quantity": ask["quantity"], "toKind": "event", "dueDate": day, "note": ask.get("note", "")}
        extra = {"requestId": request_id}
        loan_id = stage_checkout(tx, t, item_ref, snap.to_dict(), terms, recipient, access["memberId"], extra)
        tx.update(ref, {"status": "approved", "checkoutId": loan_id, **decided})
        return loan_id

    try:
        loan_id = go(db().transaction())
    except InvalidInput as err:
        raise bad(err) from err
    return {"approved": approve, "checkoutId": loan_id}
