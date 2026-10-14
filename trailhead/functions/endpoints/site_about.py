"""The "Draft with AI" helper for a troop website's About us section."""

from __future__ import annotations

import logging
import os
from datetime import UTC, date, datetime

from firebase_admin import firestore
from firebase_functions import https_fn

from endpoints.assistant import DEFAULT_LOCATION, DEFAULT_MODEL, use_fake_llm
from fb import db, fail, require_leader, troop
from handlers.assistant import usage_doc_id, within_daily_limit
from handlers.site_about import SYSTEM_PROMPT, build_prompt, clean_about, fake_about, scrub_names, validate_notes

log = logging.getLogger(__name__)
Code = https_fn.FunctionsErrorCode


def _gemini_text(prompt: str) -> str:
    """REAL path: Gemini on Vertex AI with the functions service account."""
    from google import genai
    from google.genai import types

    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")
    client = genai.Client(vertexai=True, project=project, location=os.environ.get("GEMINI_LOCATION", DEFAULT_LOCATION))
    model_name = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
    config = types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT, temperature=0.6, max_output_tokens=1024)
    response = client.models.generate_content(model=model_name, contents=prompt, config=config)
    usage = response.usage_metadata
    log.info(
        "gemini usage model=%s prompt_tokens=%s output_tokens=%s",
        model_name,
        getattr(usage, "prompt_token_count", None),
        getattr(usage, "candidates_token_count", None),
    )
    return response.text or ""


def _count(uid: str, troop_id: str, today: date) -> None:
    """Count one draft against today's limit, separately from plan drafts. Server-only usage document."""
    ref = troop(troop_id).collection("usage").document(f"about_{usage_doc_id(uid, today)}")

    @firestore.transactional
    def bump(tx) -> bool:
        snap = ref.get(transaction=tx)
        count = (snap.to_dict() or {}).get("count", 0) if snap.exists else 0
        if not within_daily_limit(count):
            return False
        doc = {"uid": uid, "date": today.isoformat(), "count": count + 1, "kind": "about"}
        tx.set(ref, {**doc, "updatedAt": firestore.SERVER_TIMESTAMP})
        return True

    if not bump(db().transaction()):
        raise fail(Code.RESOURCE_EXHAUSTED, "You've used all of today's writing help. Try again tomorrow.")


@https_fn.on_call(timeout_sec=60)
def draft_site_about(req: https_fn.CallableRequest) -> dict:
    """Draft About us text from a leader's notes. Nothing is saved; the leader edits and saves it."""
    data = req.data or {}
    troop_id = data.get("troopId")
    require_leader(req, troop_id)
    try:
        notes = validate_notes(data.get("notes"))
    except ValueError as err:
        raise fail(Code.INVALID_ARGUMENT, str(err)) from None
    t = troop(troop_id)
    scouts = [d.to_dict() for d in t.collection("members").where("kind", "==", "scout").stream()]
    notes = scrub_names(notes, [s.get("displayName") or "" for s in scouts])
    troop_doc = t.get().to_dict() or {}
    _count(req.auth.uid, troop_id, datetime.now(UTC).date())
    if use_fake_llm():
        return {"about": clean_about(fake_about(troop_doc, notes))}
    try:
        about = clean_about(_gemini_text(build_prompt(troop_doc, notes)))
    except Exception:
        log.exception("about helper failed")
        raise fail(Code.UNAVAILABLE, "The writing helper isn't available right now. Try again in a moment.") from None
    if not about:
        raise fail(Code.UNAVAILABLE, "The writing helper didn't return any text. Try again in a moment.")
    return {"about": about}
