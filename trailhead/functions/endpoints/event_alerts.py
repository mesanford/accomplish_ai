"""Tells families when an event moves, changes place, is cancelled or is back on. A failure is logged and never
touches the event.

Who hears: everyone signed up (parents about their Scouts, adults about themselves, Scouts by push only). An event
without sign-ups has no such list, so the whole troop hears, but only about events in the next two weeks.
"""

from __future__ import annotations

import logging
from datetime import date, datetime

from firebase_admin import firestore
from firebase_functions import firestore_fn

from endpoints.advancement import Written, _before_after
from endpoints.mailer import app_url
from endpoints.notify import deliver
from endpoints.push import push_all
from endpoints.signup_core import refs
from endpoints.signup_mail import by_login
from fb import db, troop, troop_today
from handlers import event_changes as changes
from handlers import event_emails as mail
from handlers import push as push_text
from handlers.signup_config import as_date
from trailhead_core.dates import human

log = logging.getLogger(__name__)


def audience(troop_id: str, event_id: str, event: dict, today: date) -> tuple[dict[str, list[str]], list[str]]:
    """({uid: first names they signed up, or [] for the whole troop}, Scout logins to push to)."""
    t = troop(troop_id)
    if (event.get("signups") or {}).get("enabled") is True:
        signups = {d.id: d.to_dict() for d in refs(t, event_id)["signups"].stream()}
        families = {uid: who["names"] for uid, who in by_login(t, list(signups), signups).items()}
        members = {i: t.collection("members").document(i).get().to_dict() or {} for i in signups}
        scouts = [m["uid"] for m in members.values() if m.get("kind") == "scout" and m.get("uid")]
        return families, scouts
    if not changes.whole_troop(event, today):
        return {}, []
    members = {d.id: d.to_dict() or {} for d in t.collection("members").stream()}
    families, scouts = {}, []
    for d in t.collection("access").stream():
        member = members.get((d.to_dict() or {}).get("memberId") or "") or {}
        if member.get("kind") == "scout":
            scouts.append(d.id)
        else:
            families[d.id] = []
    return families, scouts


def send(template: str, troop_id: str, families: dict, scouts: list[str], email_for, note) -> int:
    """Email (and push) each family login, push to Scout logins. `email_for(names)` builds one email."""
    for uid, names in families.items():
        deliver(template, [uid], email_for(names), note)
    if scouts:
        push_all(template, sorted(set(scouts) - set(families)), note)
    return len(families)


def _claim(event_ref, sig: str) -> bool:
    """True if this run sends, False if these details were already announced (a retry or another run)."""

    @firestore.transactional
    def run(tx) -> bool:
        snap = event_ref.get(transaction=tx)
        if (snap.to_dict() or {}).get("alertedFor") == sig:
            return False
        tx.update(event_ref, {"alertedFor": sig})
        return True

    return run(db().transaction())


def alert(troop_id: str, event_id: str, before: dict | None, after: dict | None, now: datetime | None = None) -> int:
    if before is None or after is None:
        return 0
    if changes.signature(after) in (changes.signature(before), after.get("alertedFor")):
        return 0  # most event writes (counts, settings, attendance) end here without reading anything
    today = troop_today(troop_id, now)
    change = changes.change_of(before, after, today)
    if change is None or not after.get("title"):
        return 0
    ref = troop(troop_id).collection("events").document(event_id)
    if not _claim(ref, changes.signature(after)):
        return 0
    families, scouts = audience(troop_id, event_id, after, today)
    start = as_date(after.get("start"))
    when = human(start) if start else None
    note_text = after.get("cancelNote") if change.kind == changes.CANCELLED else None
    note = push_text.event_changed(change.kind, after["title"], troop_id, event_id)
    url = app_url()

    def email_for(_names):
        return mail.event_changed(change.kind, after["title"], when, change.lines, note_text, troop_id, event_id, url)

    return send("event_changed", troop_id, families, scouts, email_for, note)


@firestore_fn.on_document_written(document="troops/{troopId}/events/{eventId}", secrets=["RESEND_API_KEY"])
def on_event_written_alerts(event: Written) -> None:
    """Email and push the people who need to know when an upcoming event's date, time or place changes, or it is
    cancelled or back on."""
    before, after = _before_after(event)
    try:
        alert(event.params["troopId"], event.params["eventId"], before, after)
    except Exception:
        log.exception("event change alert failed")
