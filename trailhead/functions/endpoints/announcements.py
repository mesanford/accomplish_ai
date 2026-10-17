"""Announcements and newsletters. The only way to write one, so the audience, Youth Protection and email limits always
apply. Clients can read an announcement if they are in its audience (see firestore.rules) but never write one."""

from __future__ import annotations

from datetime import date

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints import announcement_mail as mail
from endpoints.push import push_all
from fb import fail, require_access, troop
from handlers import announcement_audience as aud
from handlers import push as push_text
from handlers.announcements import (
    RATE_LIMITED,
    YPT_REQUIRED,
    can_manage,
    can_post,
    has_current_ypt,
    parse_audience,
    parse_content,
)
from handlers.membership import InvalidInput
from handlers.retention import today_local

BAD = https_fn.FunctionsErrorCode.INVALID_ARGUMENT
DENIED = https_fn.FunctionsErrorCode.PERMISSION_DENIED
NOT_FOUND = https_fn.FunctionsErrorCode.NOT_FOUND


def _docs(collection) -> dict[str, dict]:
    return {d.id: d.to_dict() for d in collection.stream()}


def _event_snapshots(t, event_ids: list[str]) -> list[dict]:
    """The title, start and place of each linked event, copied so the post reads the same later."""
    events = []
    for event_id in event_ids:
        data = t.collection("events").document(event_id).get().to_dict()
        if data is None:
            raise fail(BAD, "One of the linked events was not found.")
        events.append({"id": event_id, **{k: data[k] for k in ("title", "start", "place") if data.get(k)}})
    return events


def _signups(t, event_id: str) -> tuple[set[str], str]:
    """Member ids signed up for an event, and its title. Reads `signups`, falling back to `rsvps` (see audience)."""
    event = t.collection("events").document(event_id)
    snap = event.get().to_dict()
    if snap is None:
        raise fail(BAD, "That event was not found.")
    docs = [(d.id, d.to_dict()) for d in event.collection("signups").stream()]
    if not docs:
        docs = [(d.id, d.to_dict()) for d in event.collection("rsvps").stream()]
    return aud.signed_up_ids(docs), snap.get("title", "")


def _checked(req, data: dict, today: date):
    """Everything a post needs, with the checks that run before anything is written."""
    troop_id = data.get("troopId")
    access = require_access(req, troop_id)
    if not can_post(access):
        raise fail(DENIED, "Only leaders and committee members can post announcements.")
    try:
        content, spec = parse_content(data), parse_audience(data.get("audience"))
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    t = troop(troop_id)
    members, logins = _docs(t.collection("members")), _docs(t.collection("access"))
    signups, title = _signups(t, spec["eventId"]) if spec["type"] == "event" else (set(), "")
    audience = aud.resolve(spec, members, logins, signups, title)
    sender = members.get(access["memberId"]) or {}
    if audience.includes_scouts and not has_current_ypt(sender, today):
        raise fail(DENIED, YPT_REQUIRED)
    return t, access, content, spec, audience, members, logins, sender


@https_fn.on_call(timeout_sec=120, memory=512, secrets=["RESEND_API_KEY"])
def post_announcement(req: https_fn.CallableRequest) -> dict:
    """Post to an audience, and optionally email the adults in it (once; editing never emails again)."""
    data = req.data or {}
    t, access, content, spec, audience, members, logins, sender = _checked(req, data, date.today())
    uids, skipped, wants_email = [], 0, data.get("email") is True
    if wants_email:
        uids, skipped = mail.recipients(aud.email_uids(audience, req.auth.uid, members, logins))
        if uids and not mail.take_slot(req.data["troopId"], today_local()):
            raise fail(https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED, RATE_LIMITED)
    events = _event_snapshots(t, content.pop("eventIds"))
    post = {**content, "events": events}
    ref = t.collection("announcements").document()
    ref.set(
        {
            **post,
            "audience": spec,
            "audienceLabel": audience.label,
            "readerUids": aud.readers(audience, req.auth.uid, logins),
            "postedByUid": req.auth.uid,
            "postedByMemberId": access["memberId"],
            "postedByName": sender.get("displayName", "A leader"),
            "emailed": 0,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
    )
    emailed = 0
    if uids:
        name = (t.get().to_dict() or {}).get("name", "Your troop")
        emailed = mail.send(post, uids, sender.get("displayName", "A leader"), name, req.data["troopId"], ref.id)
        ref.update({"emailed": emailed})
    # A push goes to every login in the audience (Scouts with their own login too), whether or not it is emailed.
    name = (t.get().to_dict() or {}).get("name", "Your troop")
    others = [u for u in audience.uids if u != req.auth.uid]
    push_all("announcement", others, push_text.announcement(name, req.data["troopId"]))
    return {"announcementId": ref.id, "emailed": emailed, "emailSkipped": skipped}


def _own(req, data: dict):
    """(troop, announcement ref, announcement) when the caller may change it."""
    access = require_access(req, data.get("troopId"))
    ref = troop(data["troopId"]).collection("announcements").document(str(data.get("announcementId") or "-"))
    post = ref.get().to_dict()
    if post is None:
        raise fail(NOT_FOUND, "That announcement was not found.")
    if not can_manage(access, req.auth.uid, post):
        raise fail(DENIED, "Only the person who posted this or the Scoutmaster can change it.")
    return troop(data["troopId"]), ref, post


@https_fn.on_call()
def edit_announcement(req: https_fn.CallableRequest) -> dict:
    """Change the words, linked events or pinned state. The audience stays, and no email is sent."""
    data = req.data or {}
    t, ref, post = _own(req, data)
    try:
        content = parse_content({**data, "kind": post["kind"]})
    except InvalidInput as err:
        raise fail(BAD, str(err)) from err
    events = _event_snapshots(t, content.pop("eventIds"))
    ref.update({**content, "events": events, "editedAt": firestore.SERVER_TIMESTAMP})
    return {"announcementId": ref.id}


@https_fn.on_call()
def delete_announcement(req: https_fn.CallableRequest) -> dict:
    _, ref, _ = _own(req, req.data or {})
    ref.delete()
    return {"deleted": True}
