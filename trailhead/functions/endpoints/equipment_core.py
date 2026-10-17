"""Shared pieces for equipment check-out: who may manage, finding the recipient, and writing one loan."""

from __future__ import annotations

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import fail, kind_blocker, require_access
from handlers.equipment import can_manage, check_out_blocker
from handlers.membership import InvalidInput

Code = https_fn.FunctionsErrorCode


def require_manager(req: https_fn.CallableRequest, troop_id: str | None) -> dict:
    """The quartermaster or a leader. Nobody else changes the inventory or lends gear."""
    access = require_access(req, troop_id)
    if not can_manage(access):
        raise fail(Code.PERMISSION_DENIED, "Only the quartermaster or a troop leader can do that.")
    return access


def bad(err: InvalidInput) -> https_fn.HttpsError:
    return fail(Code.FAILED_PRECONDITION, str(err))


def read_recipient(tx, t, kind: str, recipient_id: str) -> dict:
    """The member or event a loan goes to, as {label, ...ids}. Reads only, so call it before any write."""
    if kind == "member":
        member = t.collection("members").document(recipient_id).get(transaction=tx).to_dict()
        if member is None:
            raise InvalidInput("That person isn't in the troop.")
        consent = t.collection("consents").document(recipient_id).get(transaction=tx).to_dict()
        if reason := kind_blocker(member, consent, "equipment"):
            raise InvalidInput(reason)
        scout = {"scoutId": recipient_id} if member.get("kind") == "scout" else {}
        return {"label": member.get("displayName", "Member"), "toMemberId": recipient_id, **scout}
    event = t.collection("events").document(recipient_id).get(transaction=tx).to_dict()
    if event is None:
        raise InvalidInput("That event isn't in the troop.")
    return {"label": event.get("title", "Event"), "eventId": recipient_id, "event": event}


def stage_checkout(tx, t, item_ref, item: dict, terms: dict, recipient: dict, by_member_id: str, extra: dict) -> str:
    """Write the loan and raise the item's `out` count. Raises InvalidInput if the item can't go out. Returns the id."""
    blocker = check_out_blocker(item, terms["quantity"])
    if blocker:
        raise InvalidInput(blocker)
    ref = t.collection("checkouts").document()
    loan = {
        "itemId": item_ref.id,
        "itemName": item["name"],
        "quantity": terms["quantity"],
        "toKind": terms["toKind"],
        "toLabel": recipient["label"],
        "dueDate": terms["dueDate"],
        "status": "out",
        "note": terms.get("note", ""),
        "outAt": firestore.SERVER_TIMESTAMP,
        "outById": by_member_id,
        **{k: v for k, v in recipient.items() if k in ("toMemberId", "eventId", "scoutId")},
        **extra,
    }
    if item.get("tag"):
        loan["itemTag"] = item["tag"]
    tx.set(ref, loan)
    tx.update(item_ref, {"out": int(item.get("out", 0)) + terms["quantity"]})
    return ref.id
