"""The daily retention job: deletes what the privacy policy's retention schedule says is due.

`handlers/retention.py` decides what is due; this module reads and deletes. Every rule is safe to rerun, and each
run is bounded (see `Budget`), so a large backlog is worked through over several nights. One line is logged per
rule per troop, with ids and counts only, never names or message text.
"""

from __future__ import annotations

import logging
import os
from datetime import date

from firebase_admin import firestore
from firebase_functions import options, scheduler_fn

from endpoints.retention_rules import Budget, announcements, leads, ledger, scouts, threads, usage
from endpoints.retention_troop import retire_troop
from fb import db, troop
from handlers.retention import dry_run, today_local, troop_due, troop_last_active

log = logging.getLogger(__name__)
DRY_RUN_ENV = "TRAILHEAD_RETENTION_DRY_RUN"


RULES = {
    "scouts": scouts,
    "threads": threads,
    "leads": leads,
    "announcements": announcements,
    "usage": usage,
    "ledger": ledger,
}


def _apply_rules(troop_id: str, today: date, budget: Budget) -> dict[str, int]:
    """Each rule on its own: one failing is logged and the others still run."""
    t = troop(troop_id)
    deleted = {}
    for name, rule in RULES.items():
        if budget.out_of_time():
            log.warning("retention rule=%s troop=%s skipped=out_of_time", name, troop_id)
            continue
        try:
            deleted[name] = rule(t, troop_id, today, budget)[1]
        except Exception:
            log.exception("retention rule=%s troop=%s failed", name, troop_id)
    return deleted


def run_retention(today: date, troop_dry_run: bool, budget: Budget | None = None) -> dict:
    """Apply the whole schedule once. Returns counts, for tests and the summary log."""
    budget = budget or Budget()
    totals = {
        "troops": 0,
        "troopsDue": 0,
        "scouts": 0,
        "threads": 0,
        "leads": 0,
        "announcements": 0,
        "usage": 0,
        "ledger": 0,
    }
    troops = [(s.id, s.to_dict() or {}) for s in db().collection("troops").stream()]  # read once; no long stream
    for troop_id, troop_doc in troops:
        if budget.out_of_time():
            log.warning("retention stopped=out_of_time troops_left_for_tomorrow=yes")
            break
        try:
            if troop_due(troop_doc, today):
                totals["troopsDue"] += 1
                if budget.troops > 0 and retire_troop(troop_id, today, troop_dry_run):
                    budget.troops -= 1
                    totals["troops"] += 1
                    continue
            elif troop_last_active(troop_doc) is None:
                # Troops from before activity tracking start their 18-month clock now, never in the past.
                troop(troop_id).update({"activityTrackedSince": firestore.SERVER_TIMESTAMP})
        except Exception:
            log.exception("retention rule=troop troop=%s failed", troop_id)
        for name, count in _apply_rules(troop_id, today, budget).items():
            totals[name] += count
    log.info("retention done day=%s troop_dry_run=%s totals=%s", today, troop_dry_run, totals)
    return totals


@scheduler_fn.on_schedule(
    schedule="30 3 * * *",
    timezone=scheduler_fn.Timezone("America/Chicago"),
    timeout_sec=540,
    memory=options.MemoryOption.GB_1,
)
def apply_retention(event: scheduler_fn.ScheduledEvent) -> None:
    """Every night at 03:30 US Central time."""
    run_retention(today_local(), dry_run(os.environ.get(DRY_RUN_ENV)))
