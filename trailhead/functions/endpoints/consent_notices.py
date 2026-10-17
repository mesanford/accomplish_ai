"""The daily job that emails parents about consent, without waiting for a leader.

Every morning, for each troop: mark Scouts who need a first parent consent, email the parents of Scouts waiting for
one, and email parents who agreed to an older notice. Each parent gets an email at once, then one every 7 days, at
most four (per request, or per notice version). It records what it sent, so running it again the same day sends
nothing more.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from firebase_functions import options, scheduler_fn

from endpoints.consent_requests import email_waiting_requests, sync_holds
from endpoints.consent_review import remind_parents
from fb import db, troop

log = logging.getLogger(__name__)


def run_notices(now: datetime) -> dict:
    """One pass over every troop. Returns counts, for tests and the log."""
    totals = {"troops": 0, "requestEmails": 0, "reviewEmails": 0}
    for snap in db().collection("troops").stream():
        if (snap.to_dict() or {}).get("retiredAt"):
            continue
        t = troop(snap.id)
        try:
            sync_holds(t, now)
            totals["requestEmails"] += email_waiting_requests(t, snap.id, now)
            totals["reviewEmails"] += remind_parents(t, snap.id, now, cap=10_000)["sent"]
            totals["troops"] += 1
        except Exception:
            log.exception("consent notices failed troop=%s", snap.id)
    log.info("consent notices %s", totals)
    return totals


@scheduler_fn.on_schedule(
    schedule="0 9 * * *",
    timezone=scheduler_fn.Timezone("America/Chicago"),
    timeout_sec=540,
    memory=options.MemoryOption.MB_512,
    secrets=["RESEND_API_KEY"],
)
def send_consent_notices(event: scheduler_fn.ScheduledEvent) -> None:
    """Every morning at 09:00 US Central time."""
    run_notices(datetime.now(UTC))
