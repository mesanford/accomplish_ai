"""Messages. The only way to write one, so Youth Protection rules always apply."""

from __future__ import annotations

from firebase_admin import firestore
from firebase_functions import https_fn

from fb import HOLD_MESSAGE, fail, is_held, require_access, troop, troop_today
from handlers.messaging import participant_uids, pending_links, people_from_members
from trailhead_core import YPTViolation, plan_delivery

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT


@https_fn.on_call()
def send_message(req: https_fn.CallableRequest) -> dict:
    """Start a thread (recipientMemberIds) or reply in one (threadId). Adds parents or a second adult as needed."""
    data = req.data or {}
    troop_id, body = data.get("troopId"), (data.get("body") or "").strip()
    access = require_access(req, troop_id)
    if not body:
        raise fail(BAD, "Write a message first.")
    if len(body) > 4000:
        raise fail(BAD, "Messages can be up to 4,000 characters.")
    t = troop(troop_id)
    sender_id = access["memberId"]
    thread_ref = None
    if data.get("threadId"):
        thread_ref = t.collection("threads").document(data["threadId"])
        thread = thread_ref.get().to_dict()
        if thread is None or req.auth.uid not in thread.get("participantUids", []):
            raise fail(https_fn.FunctionsErrorCode.NOT_FOUND, "That conversation wasn't found.")
        recipient_ids = [m for m in thread["memberIds"] if m != sender_id]
    else:
        recipient_ids = [m for m in dict.fromkeys(data.get("recipientMemberIds") or []) if m != sender_id]
    if not recipient_ids:
        raise fail(BAD, "Choose who to send this to.")

    members = {d.id: d.to_dict() for d in t.collection("members").stream()}
    pending = pending_links([d.to_dict() for d in t.collection("access").stream()])
    people = people_from_members(members, pending)
    if sender_id not in people or any(r not in people for r in recipient_ids):
        raise fail(BAD, "One of the recipients isn't in this troop.")
    if any(is_held(members.get(r)) for r in recipient_ids):
        raise fail(BAD, HOLD_MESSAGE)
    second_adults = (t.get().to_dict() or {}).get("yptCopyMemberIds", [])
    try:
        delivery = plan_delivery(
            people[sender_id],
            [people[r] for r in recipient_ids],
            people,
            second_adults,
            troop_today(troop_id),
            new_thread=thread_ref is None,
        )
    except YPTViolation as err:
        who = (members.get(err.person_id) or {}).get("displayName", "An adult in this conversation")
        message = f"{who} {err}" if err.person_id else str(err)
        raise fail(https_fn.FunctionsErrorCode.PERMISSION_DENIED, message) from err

    all_members = list(dict.fromkeys([sender_id, *delivery.recipient_ids]))
    preview = body[:140]
    thread_fields = {
        "memberIds": all_members,
        "participantUids": participant_uids(all_members, members),
        "lastMessage": preview,
        "lastSenderMemberId": sender_id,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    if thread_ref is None:
        thread_ref = t.collection("threads").document()
        thread_ref.set(
            {**thread_fields, "yptAddedMemberIds": delivery.added_ids, "createdAt": firestore.SERVER_TIMESTAMP}
        )
    else:
        if delivery.added_ids:  # ArrayUnion refuses an empty list
            thread_fields["yptAddedMemberIds"] = firestore.ArrayUnion(delivery.added_ids)
        thread_ref.update(thread_fields)
    thread_ref.collection("messages").add(
        {"senderMemberId": sender_id, "body": body, "createdAt": firestore.SERVER_TIMESTAMP}
    )
    return {
        "threadId": thread_ref.id,
        "recipientMemberIds": delivery.recipient_ids,
        "addedMemberIds": delivery.added_ids,
    }
