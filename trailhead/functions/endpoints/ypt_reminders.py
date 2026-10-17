"""The daily Youth Protection job: remind adults before their training lapses, and tell the Scoutmaster each week.

Email and push both respect the person's notification opt-out (`users/{uid}.emailNotifications`). Scouts are never
sent anything. Idempotent: what was sent is recorded in `troops/{t}/yptReminders` (closed to every client) before
sending, inside a transaction, so a rerun, an overlap or a retry never sends the same reminder twice.
See `handlers/ypt_reminders.py` for the schedule.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime

from firebase_admin import firestore
from firebase_functions import options, scheduler_fn

from endpoints.mailer import app_url
from endpoints.notify import deliver
from fb import db, troop
from handlers import ypt_messages as text
from handlers import ypt_reminders as rules
from handlers.roles import as_date
from handlers.signups import troop_zone

log = logging.getLogger(__name__)
WEEKLY = "_weekly"  # the weekly list's record, beside the per-adult records (member ids never start with "_")


def _claim_adult(ref, expires: date, today: date) -> str | None:
    """Decide and record in one transaction. Returns the stage to send, or None if it already went out."""

    @firestore.transactional
    def run(tx) -> str | None:
        plan = rules.plan_member(expires, today, ref.get(transaction=tx).to_dict())
        if plan.stage and plan.record:
            tx.set(ref, {**plan.record, "updatedAt": firestore.SERVER_TIMESTAMP})
        return plan.stage

    return run(db().transaction())


def _claim_week(ref, today: date) -> bool:
    @firestore.transactional
    def run(tx) -> bool:
        if not rules.digest_due(today, ref.get(transaction=tx).to_dict()):
            return False
        tx.set(ref, {**rules.digest_record(today), "updatedAt": firestore.SERVER_TIMESTAMP})
        return True

    return run(db().transaction())


def _remind_adults(troop_id: str, t, members: dict, access: dict, today: date, url: str) -> int:
    sent = 0
    for member_id, member in members.items():
        uid = member.get("uid")
        login = access.get(uid) if uid else None
        if login is None or "scout" in login.get("roles", []) or not rules.needs_ypt(member, login.get("roles")):
            continue
        expires = as_date(member.get("yptExpiresAt"))
        stage = expires and _claim_adult(t.collection("yptReminders").document(member_id), expires, today)
        if not stage or expires is None:
            continue
        email = text.adult_email(stage, expires, today, troop_id, url)
        deliver(f"ypt_{stage}", [uid], email, text.adult_push(stage, troop_id))
        sent += 1
    return sent


def _weekly_list(troop_id: str, t, members: dict, access: dict, today: date, url: str) -> int:
    by_member = {a.get("memberId"): a.get("roles", []) for a in access.values()}
    rows = rules.attention(members, today, by_member)
    managers = sorted(u for u, a in access.items() if "scoutmaster" in a.get("roles", []))
    if not rows or not managers or not _claim_week(t.collection("yptReminders").document(WEEKLY), today):
        return 0
    deliver("ypt_weekly", managers, text.weekly_email(rows, troop_id, url), text.weekly_push(len(rows), troop_id))
    return 1


def run_ypt_reminders(now: datetime) -> dict:
    """Run for every troop, by each troop's own calendar. Returns counts, for tests and the log."""
    totals = {"reminders": 0, "weekly": 0}
    url = app_url()
    for snap in db().collection("troops").stream():
        zone = troop_zone(snap.to_dict())
        today = (now.astimezone(zone) if zone else now).date()
        t = troop(snap.id)
        try:
            members = {d.id: d.to_dict() or {} for d in t.collection("members").stream()}
            access = {d.id: d.to_dict() or {} for d in t.collection("access").stream()}
            totals["reminders"] += _remind_adults(snap.id, t, members, access, today, url)
            totals["weekly"] += _weekly_list(snap.id, t, members, access, today, url)
        except Exception:
            log.exception("ypt reminders failed troop=%s", snap.id)
    log.info("ypt reminders done totals=%s", totals)
    return totals


@scheduler_fn.on_schedule(
    schedule="30 8 * * *",
    timezone=scheduler_fn.Timezone("America/Chicago"),
    timeout_sec=300,
    memory=options.MemoryOption.MB_512,
    secrets=["RESEND_API_KEY"],
)
def send_ypt_reminders(event: scheduler_fn.ScheduledEvent) -> None:
    """Every morning at 08:30 US Central time."""
    run_ypt_reminders(datetime.now(UTC))
