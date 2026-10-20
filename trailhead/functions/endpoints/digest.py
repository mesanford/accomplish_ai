"""The weekly family digest, every Sunday evening (see handlers/digest.py). Safe to run again.

Idempotent per troop and week: `troops/{t}/digestRuns/{weekOf}` is created in a transaction before anything is sent,
so a rerun, an overlap or a retry sends nothing twice. A failed send is logged and never stops the other troops.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from firebase_admin import firestore
from firebase_functions import options, scheduler_fn

from endpoints.mailer import address_of, app_url, send_all
from endpoints.signup_core import refs
from endpoints.signup_mail import by_login
from fb import db
from handlers import digest as dg
from handlers.digest_email import weekly_digest
from handlers.payments import troop_label
from handlers.signup_config import as_date, troop_zone
from handlers.signups import GOING, WAITING, status_of

log = logging.getLogger(__name__)


def _claim(troop_ref, week: str) -> bool:
    ref = troop_ref.collection("digestRuns").document(week)

    @firestore.transactional
    def run(tx) -> bool:
        if ref.get(transaction=tx).exists:
            return False
        tx.set(ref, {"sentAt": firestore.SERVER_TIMESTAMP})
        return True

    return run(db().transaction())


def _sign_ups(t, events: list[tuple[str, dict]], first, last) -> tuple[dict, dict]:
    """({event_id: {uid: names signed up}} for this week's events, {event_id: {uid: Scouts waiting}})."""
    families, owed = {}, {}
    for event_id, event in events:
        if (event.get("signups") or {}).get("enabled") is not True:
            continue
        start = as_date(event.get("start"))
        this_week = start is not None and first <= start <= last
        waiting_count = (event.get("signupCounts") or {}).get("waitingPermission", 0)
        if not this_week and not waiting_count:
            continue
        signups = {d.id: d.to_dict() for d in refs(t, event_id)["signups"].stream()}
        if this_week:
            held = [i for i, s in signups.items() if status_of(s) in (GOING, WAITING)]
            families[event_id] = {uid: who["names"] for uid, who in by_login(t, held, signups).items()}
        waiting = [i for i, s in signups.items() if status_of(s) == WAITING]
        if waiting:
            owed[event_id] = {uid: who["names"] for uid, who in by_login(t, waiting, {}).items()}
    return families, owed


def run_troop(snap, now: datetime) -> int:
    zone = troop_zone(snap.to_dict())
    today = (now.astimezone(zone) if zone else now).date()
    first, last = dg.window(today)
    if not _claim(snap.reference, dg.week_of(today)):
        return 0
    t = snap.reference
    horizon = (today + timedelta(days=dg.LOOK_AHEAD_DAYS)).isoformat()
    query = t.collection("events").where("start", ">=", today.isoformat()).where("start", "<=", horizon)
    events = [(d.id, d.to_dict() or {}) for d in query.stream()]
    families, owed = _sign_ups(t, events, first, last)
    since = now - timedelta(days=dg.WEEK_DAYS)
    posts = [d.to_dict() or {} for d in t.collection("announcements").where("createdAt", ">=", since).stream()]
    access = {d.id: d.to_dict() or {} for d in t.collection("access").stream()}
    members = {d.id: d.to_dict() or {} for d in t.collection("members").stream()}
    name, url, sent = troop_label(snap.to_dict()), app_url(), 0
    for uid in dg.readers(access, members):
        if not dg.wants_digest(db().collection("users").document(uid).get().to_dict()):
            continue
        digest = dg.build(uid, events, families, owed, posts, today)
        address = None if digest.empty() else address_of(uid)
        if address:
            sent += send_all("weekly_digest", [address], weekly_digest(name, digest, first, snap.id, url))
    return sent


def run_digest(now: datetime) -> dict:
    """Send this week's digest for every troop. Returns counts, for tests and the log."""
    totals = {"troops": 0, "emails": 0}
    for snap in db().collection("troops").stream():
        try:
            totals["emails"] += run_troop(snap, now)
            totals["troops"] += 1
        except Exception:
            log.exception("weekly digest failed troop=%s", snap.id)
    log.info("weekly digest done totals=%s", totals)
    return totals


@scheduler_fn.on_schedule(
    schedule="0 17 * * 0",
    timezone=scheduler_fn.Timezone("America/Chicago"),
    timeout_sec=540,
    memory=options.MemoryOption.MB_512,
    secrets=["RESEND_API_KEY"],
)
def send_weekly_digest(event: scheduler_fn.ScheduledEvent) -> None:
    """Every Sunday at 17:00 US Central time."""
    run_digest(datetime.now(UTC))
