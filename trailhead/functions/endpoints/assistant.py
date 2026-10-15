"""The plan assistant callable: Claude drafts, the rules engine verifies."""

from __future__ import annotations

import logging
import os
from datetime import UTC, date, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.advancement import _scout_record
from fb import db, fail, require_access, troop
from handlers.assistant import ModelFn, draft_plan, usage_doc_id, validate_request, within_daily_limit
from handlers.claude_model import DEFAULT_MODEL, claude_model, real_client
from handlers.fake_planner import fake_plan
from handlers.site_about import scrub_names
from trailhead_core import load_catalog

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


def use_fake_llm() -> bool:
    """FAKE path: the Functions emulator and TRAILHEAD_FAKE_LLM=1 never call Anthropic."""
    return os.environ.get("FUNCTIONS_EMULATOR") == "true" or os.environ.get("TRAILHEAD_FAKE_LLM") == "1"


def _claude() -> ModelFn:
    """REAL path: Claude through the Anthropic API. The key comes from the ANTHROPIC_API_KEY secret."""
    return claude_model(real_client(os.environ), os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL))


def _count_draft(uid: str, troop_id: str, today: date) -> None:
    """Count one draft against today's limit. Server-only document: troops/{t}/usage/{uid}_{date}."""
    ref = troop(troop_id).collection("usage").document(usage_doc_id(uid, today))

    @firestore.transactional
    def bump(tx) -> bool:
        snap = ref.get(transaction=tx)
        count = (snap.to_dict() or {}).get("count", 0) if snap.exists else 0
        if not within_daily_limit(count):
            return False
        tx.set(
            ref, {"uid": uid, "date": today.isoformat(), "count": count + 1, "updatedAt": firestore.SERVER_TIMESTAMP}
        )
        return True

    if not bump(db().transaction()):
        raise fail(Code.RESOURCE_EXHAUSTED, "You've used all of today's plan drafts. Try again tomorrow.")


def _parse_date(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise fail(Code.INVALID_ARGUMENT, "That target date isn't valid.") from None


@https_fn.on_call(timeout_sec=120, memory=512, secrets=["ANTHROPIC_API_KEY"])
def draft_path(req: https_fn.CallableRequest) -> dict:
    """Draft a plan from plain words. The caller must be able to see the Scout. Nothing is saved."""
    data = req.data or {}
    troop_id, scout_id, goal_id = data.get("troopId"), data.get("scoutId"), data.get("goalAwardId")
    require_access(req, troop_id, scout_id=scout_id)
    catalog = load_catalog()
    if goal_id not in catalog.ranks or catalog.ranks[goal_id].order == 0:
        raise fail(Code.INVALID_ARGUMENT, "Choose a rank as the goal.")
    try:
        request = validate_request(data.get("request"))
    except ValueError as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from None
    # The request goes to Anthropic, so names of Scouts on the roster are removed first, as for the About helper.
    names = [m.get("displayName") or "" for m in (d.to_dict() for d in troop(troop_id).collection("members").stream())]
    request = scrub_names(request, names)
    target = _parse_date(data.get("targetDate"))
    scout = _scout_record(troop(troop_id), scout_id)
    if scout is None:
        raise fail(Code.FAILED_PRECONDITION, "Add the Scout's birth month and rank first.")

    today = datetime.now(UTC).date()
    _count_draft(req.auth.uid, troop_id, today)
    if use_fake_llm():
        model: ModelFn = lambda _prompt: fake_plan(scout, goal_id, catalog, today)  # noqa: E731
    else:
        model = _claude()
    try:
        return draft_plan(model, scout, goal_id, target, request, today, catalog)
    except https_fn.HttpsError:
        raise
    except Exception:
        log.exception("plan assistant failed")
        raise fail(Code.UNAVAILABLE, "The plan assistant isn't available right now. Try again in a moment.") from None
