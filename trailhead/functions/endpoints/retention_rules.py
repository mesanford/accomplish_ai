"""The per-troop retention rules: Scouts, conversations, leads and draft counters. Each one reads what may be due,
lets `handlers/retention.py` decide, deletes within the run's `Budget`, and logs one line for the troop."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import date

from firebase_admin import firestore

from endpoints.erase import commit, delete_op
from endpoints.leads import erase_lead
from endpoints.ledger_retention import purge
from endpoints.removal import erase_scout
from handlers.retention import (
    ANNOUNCEMENT_MONTHS,
    LEAD_MONTHS,
    THREAD_MONTHS,
    announcement_due,
    lead_due,
    plan_scouts,
    plan_usage,
    query_cutoff,
    thread_due,
)

log = logging.getLogger(__name__)
MESSAGE_PAGE = 400


@dataclass
class Budget:
    """The most one run deletes; the next night carries on. `seconds` stops new work well before the timeout."""

    scouts: int = 20
    threads: int = 200
    leads: int = 500
    announcements: int = 500
    usage: int = 2000
    troops: int = 2
    ledger: int = 2000
    equipment: int = 2000
    seconds: float = 420
    started: float = field(default_factory=time.monotonic)

    def out_of_time(self) -> bool:
        return time.monotonic() - self.started > self.seconds


def scouts(t, troop_id: str, today: date, budget: Budget) -> tuple[int, int]:
    members = {d.id: d.to_dict() for d in t.collection("members").where("kind", "==", "scout").stream()}
    records = {d.id: d.to_dict() for d in t.collection("scoutRecords").stream()}
    due = plan_scouts(members, records, today)
    reasons = {"left": 0, "age": 0}
    failed = 0
    for scout_id, reason in due:
        if budget.scouts <= 0 or budget.out_of_time():
            break
        budget.scouts -= 1
        try:
            erase_scout(troop_id, scout_id, members[scout_id].get("uid"))
        except Exception:  # one Scout's failure must not block the others; it is retried tomorrow
            log.exception("retention rule=scouts troop=%s scout=%s failed", troop_id, scout_id)
            failed += 1
            continue
        reasons[reason] += 1
    log.info(
        "retention rule=scouts troop=%s due=%d left=%d age=%d failed=%d", troop_id, len(due), *reasons.values(), failed
    )
    return len(due), sum(reasons.values())


def _delete_thread(ref) -> int:
    """Messages first, in pages, then the thread (so a failed run finds the thread again)."""
    removed = 0
    while True:
        page = [m.reference for m in ref.collection("messages").limit(MESSAGE_PAGE).stream()]
        if not page:
            break
        commit([delete_op(m) for m in page])
        removed += len(page)
    ref.delete()
    return removed


def _newest_message_at(ref):
    query = ref.collection("messages").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(1)
    newest = list(query.stream())
    return newest[0].to_dict().get("createdAt") if newest else None


def threads(t, troop_id: str, today: date, budget: Budget) -> tuple[int, int]:
    if budget.threads <= 0:
        log.info("retention rule=threads troop=%s skipped=budget", troop_id)
        return 0, 0
    cutoff = query_cutoff(today, THREAD_MONTHS)
    old = t.collection("threads").where("updatedAt", "<", cutoff).order_by("updatedAt").limit(budget.threads)
    due = deleted = messages = 0
    for snap in old.stream():
        newest_at = _newest_message_at(snap.reference)
        if not thread_due(snap.to_dict(), newest_at, today):
            continue
        due += 1
        if budget.out_of_time():
            break
        budget.threads -= 1
        try:
            messages += _delete_thread(snap.reference)
        except Exception:
            log.exception("retention rule=threads troop=%s thread=%s failed", troop_id, snap.id)
            continue
        deleted += 1
    log.info("retention rule=threads troop=%s due=%d deleted=%d messages=%d", troop_id, due, deleted, messages)
    return due, deleted


def leads(t, troop_id: str, today: date, budget: Budget) -> tuple[int, int]:
    if budget.leads <= 0:
        log.info("retention rule=leads troop=%s skipped=budget", troop_id)
        return 0, 0
    cutoff = query_cutoff(today, LEAD_MONTHS)
    old = t.collection("leads").where("createdAt", "<", cutoff).order_by("createdAt").limit(budget.leads)
    due = [s.id for s in old.stream() if lead_due(s.to_dict(), today)]
    deleted = 0
    for lead_id in due:
        budget.leads -= 1
        try:
            erase_lead(troop_id, lead_id)
        except Exception:
            log.exception("retention rule=leads troop=%s lead=%s failed", troop_id, lead_id)
            continue
        deleted += 1
    log.info("retention rule=leads troop=%s due=%d deleted=%d", troop_id, len(due), deleted)
    return len(due), deleted


def usage(t, troop_id: str, today: date, budget: Budget) -> tuple[int, int]:
    usage = t.collection("usage")
    due = plan_usage([d.id for d in usage.list_documents()], today, budget.usage)
    commit([delete_op(usage.document(i)) for i in due])
    budget.usage -= len(due)
    log.info("retention rule=usage troop=%s due=%d deleted=%d", troop_id, len(due), len(due))
    return len(due), len(due)


def announcements(t, troop_id: str, today: date, budget: Budget) -> tuple[int, int]:
    """Announcements and newsletters, 24 months after posting."""
    if budget.announcements <= 0:
        log.info("retention rule=announcements troop=%s skipped=budget", troop_id)
        return 0, 0
    cutoff = query_cutoff(today, ANNOUNCEMENT_MONTHS)
    old = (
        t.collection("announcements").where("createdAt", "<", cutoff).order_by("createdAt").limit(budget.announcements)
    )
    due = [s.reference for s in old.stream() if announcement_due(s.to_dict(), today)]
    commit([delete_op(ref) for ref in due])
    budget.announcements -= len(due)
    log.info("retention rule=announcements troop=%s due=%d deleted=%d", troop_id, len(due), len(due))
    return len(due), len(due)


def ledger(t, troop_id: str, today: date, budget: Budget) -> tuple[int, int]:
    """Scout account entries: deleted 7 years after their date, with any total still held brought forward."""
    if budget.ledger <= 0:
        log.info("retention rule=ledger troop=%s skipped=budget", troop_id)
        return 0, 0
    due, deleted = purge(t, troop_id, today, budget.ledger)
    budget.ledger -= deleted
    return due, deleted
