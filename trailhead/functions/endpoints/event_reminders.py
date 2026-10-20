"""The daily reminder: two days before an event, email the families who are signed up. Safe to run again.

Idempotent: before sending, the job records the event date it reminded for in `reminderSentFor` (inside a
transaction), so a rerun, an overlap or a retry never sends a second email. Moving the event re-arms the reminder.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_admin import firestore
from firebase_functions import options, scheduler_fn

from endpoints.mailer import app_url
from endpoints.notify import deliver
from endpoints.signup_core import refs
from endpoints.signup_mail import by_login, push_to_scouts
from fb import db, troop
from handlers import event_emails as mail
from handlers import push as push_text
from handlers import signups as rules
from handlers.signups import GOING, WAITING, status_of

log = logging.getLogger(__name__)


def _claim(event_ref, start: str) -> bool:
    """True if this run is the one that should send, False if the reminder for this date already went out."""

    @firestore.transactional
    def run(tx) -> bool:
        snap = event_ref.get(transaction=tx)
        if (snap.to_dict() or {}).get("reminderSentFor") == start:
            return False
        tx.update(event_ref, {"reminderSentFor": start})
        return True

    return run(db().transaction())


def _remind(troop_id: str, event_id: str, event: dict) -> int:
    t, url = troop(troop_id), app_url()
    signups = {d.id: d.to_dict() for d in refs(t, event_id)["signups"].stream()}
    going = [i for i, s in signups.items() if status_of(s) == GOING]
    waiting = [i for i, s in signups.items() if status_of(s) == WAITING]
    families = by_login(t, going, signups)
    owed = by_login(t, waiting, {})
    start, place = rules.as_date(event.get("start")), event.get("place")
    sent = 0
    for uid in dict.fromkeys([*families, *owed]):
        names = families.get(uid, {}).get("names", [])
        pending = owed.get(uid, {}).get("names", [])
        email = mail.event_reminder(names, pending, event["title"], start, place, troop_id, event_id, url)
        note = push_text.event_reminder(event["title"], troop_id, event_id)
        deliver("event_reminder", [uid], email, note)
        sent += 1
    push_to_scouts(t, "event_reminder", going, lambda _: push_text.event_reminder(event["title"], troop_id, event_id))
    return sent


def run_reminders(now: datetime) -> dict:
    """Remind for every event two days away (by each troop's own calendar). Returns counts, for tests and the log."""
    totals = {"events": 0, "emails": 0}
    for snap in db().collection("troops").stream():
        zone = rules.troop_zone(snap.to_dict())
        target = rules.reminder_day((now.astimezone(zone) if zone else now).date()).isoformat()
        for ev in snap.reference.collection("events").where("start", "==", target).stream():
            event = ev.to_dict() or {}
            config = rules.read_config(event)
            if config is None or not event.get("title") or event.get("cancelled") is True:
                continue
            if not _claim(ev.reference, target):
                continue
            try:
                totals["emails"] += _remind(snap.id, ev.id, event)
                totals["events"] += 1
            except Exception:
                log.exception("event reminder failed troop=%s event=%s", snap.id, ev.id)
    log.info("event reminders done totals=%s", totals)
    return totals


@scheduler_fn.on_schedule(
    schedule="0 8 * * *",
    timezone=scheduler_fn.Timezone("America/Chicago"),
    timeout_sec=300,
    memory=options.MemoryOption.MB_512,
    secrets=["RESEND_API_KEY"],
)
def send_event_reminders(event: scheduler_fn.ScheduledEvent) -> None:
    """Every morning at 08:00 US Central time."""
    run_reminders(datetime.now(UTC))
