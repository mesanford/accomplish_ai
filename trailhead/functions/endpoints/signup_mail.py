"""Sends the sign-up emails. A failure is logged and never undoes the sign-up that caused it."""

from __future__ import annotations

import logging

from endpoints.mailer import app_url
from endpoints.notify import deliver
from fb import troop
from handlers import event_emails as mail
from handlers.email_recipients import parent_uids
from handlers.email_templates import first_name
from handlers.signups import WAITING, as_date, status_of

log = logging.getLogger(__name__)


def by_login(t, member_ids: list[str], signups: dict[str, dict]) -> dict[str, dict[str, list[str]]]:
    """Who to email for these people: {uid: {"names": [...], "pending": [...]}}.

    A Scout's parents hear about the Scout (first name only); an adult hears about themselves. Scouts are never emailed.
    """
    access = {d.id: d.to_dict() for d in t.collection("access").stream()}
    out: dict[str, dict[str, list[str]]] = {}
    for member_id in dict.fromkeys(member_ids):
        member = t.collection("members").document(member_id).get().to_dict() or {}
        waiting = status_of(signups.get(member_id) or {}) == WAITING
        if member.get("kind") == "scout":
            label, uids = first_name(member.get("displayName")), parent_uids(member_id, member, access)
        else:
            label, uids = "you", [u for u, a in access.items() if a.get("memberId") == member_id]
        for uid in uids:
            entry = out.setdefault(uid, {"names": [], "pending": []})
            entry["names"].append(label)
            if waiting:
                entry["pending"].append(label)
    return out


def send_promoted(troop_id: str, event_id: str, event: dict, promoted: list[str], signups: dict[str, dict]) -> None:
    if not promoted:
        return
    try:
        t, url = troop(troop_id), app_url()
        for uid, who in by_login(t, promoted, signups).items():
            email = mail.waitlist_promoted(
                who["names"], who["pending"], event.get("title", "the event"), troop_id, event_id, url
            )
            deliver("event_waitlist_promoted", [uid], email)
    except Exception:
        log.error("waitlist email failed")


def send_permission_needed(troop_id: str, event_id: str, event: dict, scout_ids: list[str]) -> None:
    if not scout_ids:
        return
    try:
        t, url = troop(troop_id), app_url()
        start = as_date(event.get("start"))
        for uid, who in by_login(t, scout_ids, {}).items():
            email = mail.permission_needed(
                who["names"], event.get("title", "the event"), start, troop_id, event_id, url
            )
            deliver("event_permission_needed", [uid], email)
    except Exception:
        log.error("permission email failed")
