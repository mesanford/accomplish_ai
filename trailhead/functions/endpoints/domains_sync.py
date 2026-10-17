"""Every hour: refresh domains that aren't live yet, and finish detaching any that couldn't be released.

A domain that is still not live 7 days after it was added is detached and marked failed (see `refresh_troop`);
the Website page then tells the leader. Safe to run again at any time.
"""

from __future__ import annotations

import logging

from firebase_functions import scheduler_fn

from endpoints.domains import refresh_troop, retry_removals
from endpoints.hosting_client import HostingError, hosting_client
from fb import db
from handlers.domains import PENDING

log = logging.getLogger(__name__)
MAX_PER_RUN = 200


def sync_pending() -> dict[str, int]:
    """One pass. Returns counts for the log."""
    client = hosting_client()
    if client is None:
        return {"checked": 0, "failed": 0, "removed": 0}
    query = db().collection("domains").where("kind", "==", "primary").where("status", "in", list(PENDING))
    checked = errors = 0
    for d in query.limit(MAX_PER_RUN).stream():
        troop_id = (d.to_dict() or {}).get("troopId")
        try:
            refresh_troop(troop_id, client)
            checked += 1
        except HostingError:
            errors += 1  # the next hour tries again
        except Exception:
            errors += 1
            log.exception("domain sync failed troop=%s", troop_id)
    removed = retry_removals()
    log.info("domain sync checked=%d errors=%d removed=%d", checked, errors, removed)
    return {"checked": checked, "failed": errors, "removed": removed}


@scheduler_fn.on_schedule(schedule="every 60 minutes", timeout_sec=300, memory=256)
def sync_domains(event: scheduler_fn.ScheduledEvent) -> None:
    sync_pending()
