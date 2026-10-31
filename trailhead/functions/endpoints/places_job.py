"""The place catalog's refresh: every 6 months, quietly, a few minutes at a time.

The job wakes every 2 hours. It does nothing unless a refresh is due (REFRESH_DAYS after the last one finished) or
one is under way. Each wake-up works for at most WORK_SECONDS and saves where it got to in placeRuns/{run}:
federal campgrounds (Recreation.gov), then each state's parks (OpenStreetMap, and the state's own list where it
publishes one), then the high adventure bases. A state whose source is busy is tried again next time. When the run
finishes, catalogMeta/current records the counts, which the app shows planners as "places updated".
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime, timedelta

from firebase_admin import firestore
from firebase_functions import options, scheduler_fn

from endpoints import places_sources as src
from endpoints import places_store as store
from fb import db
from handlers import places as P
from handlers.places_ha import BASES, read_base
from handlers.places_states import NAMES, STATE_SOURCES, booking_site

log = logging.getLogger(__name__)
REFRESH_DAYS = 182
WORK_SECONDS = 420
LEASE_SECONDS = 600
PAUSE_SECONDS = 3
MAX_TRIES = 4  # a state whose source keeps failing is skipped for this run after this many tries
STAGES = ("federal", "states", "highAdventure", "done")


def new_run(now: datetime) -> dict:
    return {"stage": "federal", "statesLeft": sorted(NAMES), "tries": {}, "counts": {}, "startedAt": now}


def due(meta: dict | None, run: dict | None, now: datetime) -> bool:
    if run and run.get("stage") != "done":
        return True
    finished = (meta or {}).get("finishedAt")
    return not finished or now - finished >= timedelta(days=REFRESH_DAYS)


def state_places(state: str, deps: dict) -> dict:
    mapped = P.osm_parks(state, deps["overpass"](state), booking_site(state))
    if state in STATE_SOURCES:
        return P.merge_state(P.layer_parks(state, deps["layer"](state), STATE_SOURCES[state]), mapped)
    return mapped


def advance(run: dict, deps: dict, deadline: float, today: str) -> dict:
    """Do as much of the run as fits before `deadline` (time.monotonic()). Returns the run, updated."""
    run = {**run, "tries": dict(run.get("tries") or {}), "statesLeft": list(run.get("statesLeft") or [])}
    if run["stage"] == "federal":
        fac, addr, area = deps["ridb"]()
        counts = deps["save"](P.federal_places(fac, addr, area), deps["stored"]("recreation.gov", None))
        run |= {"stage": "states", "counts": store.add_counts(run.get("counts"), counts)}
    while run["stage"] == "states" and run["statesLeft"] and time.monotonic() < deadline:
        state = run["statesLeft"][0]
        try:
            new = state_places(state, deps)
        except Exception:
            log.warning("place catalog: %s not read this time", state)
            run["tries"][state] = run["tries"].get(state, 0) + 1
            if run["tries"][state] < MAX_TRIES:
                break  # the source is busy: try again on the next wake-up
            run["statesLeft"].pop(0)
            continue
        old = {**deps["stored"]("openstreetmap", state), **deps["stored"]("state", state)}
        run["counts"] = store.add_counts(run.get("counts"), deps["save"](new, old))
        run["statesLeft"].pop(0)
        deps.get("pause", time.sleep)(PAUSE_SECONDS)  # one query at a time, gently, on a shared public server
    if run["stage"] == "states" and not run["statesLeft"]:
        run["stage"] = "highAdventure"
    if run["stage"] == "highAdventure" and time.monotonic() < deadline:
        bases = {pid: read_base(pid, deps["page"], deps["ask"], today) for pid in BASES}
        run["counts"] = store.add_counts(run.get("counts"), deps["save"](bases, deps["stored"]("program", None)))
        run["stage"] = "done"
    return run


REAL = {
    "ridb": src.ridb_tables,
    "overpass": src.overpass_state,
    "layer": src.state_layer,
    "page": src.fetch_page,
    "ask": src.ask_claude,
    "save": store.save,
    "stored": store.stored,
}


def work(now: datetime | None = None, deps: dict | None = None) -> str:
    """One wake-up. Returns what it did, for the log."""
    now = now or datetime.now(UTC)
    meta_ref = db().collection("catalogMeta").document("current")
    meta = meta_ref.get().to_dict() or {}
    run_ref = db().collection("placeRuns").document(meta.get("runId") or "-") if meta.get("runId") else None
    run = run_ref.get().to_dict() if run_ref else None
    if not due(meta, run, now):
        return "not due"
    if (run or {}).get("leaseUntil") and run["leaseUntil"] > now and run.get("stage") != "done":
        return "busy"
    if not run or run.get("stage") == "done":
        run_ref = db().collection("placeRuns").document(now.strftime("%Y-%m-%d"))
        run = new_run(now)
        meta_ref.set({"runId": run_ref.id}, merge=True)
    run_ref.set({**run, "leaseUntil": now + timedelta(seconds=LEASE_SECONDS)})
    run = advance(run, deps or REAL, time.monotonic() + WORK_SECONDS, now.date().isoformat())
    run["leaseUntil"] = None
    if run["stage"] == "done":
        run["finishedAt"] = firestore.SERVER_TIMESTAMP
        meta_ref.set({"runId": run_ref.id, "finishedAt": now, "summary": run.get("counts") or {}}, merge=True)
    run_ref.set(run)
    log.info("place catalog stage=%s states_left=%d", run["stage"], len(run.get("statesLeft") or []))
    return run["stage"]


@scheduler_fn.on_schedule(
    schedule="every 2 hours",
    timeout_sec=540,
    memory=options.MemoryOption.GB_2,
    secrets=["ANTHROPIC_API_KEY"],
)
def refresh_places(event: scheduler_fn.ScheduledEvent) -> None:
    work()
