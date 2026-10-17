"""Which notice version first covered each kind of Scout data, and when new data of a kind must wait for a parent.

A Scout whose latest parent consent is older than the version that added a kind of data gets no NEW data of that
kind until a parent agrees to the updated notice. Data already stored stays. Keep DATA_KINDS equal to
DATA_KINDS_ADDED in app/src/lib/consentChangelog.ts (tests/unit/test_consent_kinds.py checks they match).
"""

from __future__ import annotations

from handlers.consent_review import is_older, version_key

# kind of data -> the notice version that first said we keep it
DATA_KINDS = {
    "accounts": "2026-10-16.1",
    "health": "2026-10-16.1",
    "patrols": "2026-10-17.1",
    "activity": "2026-10-17.1",
    "equipment": "2026-10-17.1",
}
KIND_WORDS = {
    "accounts": "Scout account entries",
    "health": "health notes",
    "patrols": "patrol assignments",
    "activity": "activity log entries",
    "equipment": "equipment loans",
}
UPDATED_REASON = "Waiting for a parent to agree to the updated notice."
HOLD_MESSAGE = (
    "This Scout is waiting for a parent or guardian to give consent. Nothing else can be recorded for them until a "
    "parent agrees to the notice."
)


def is_held(member: dict | None) -> bool:
    """True if this roster member is a Scout still waiting for a parent's first consent (`consentHold`)."""
    return bool(member and member.get("kind") == "scout" and member.get("consentHold"))


def kind_blocker(member: dict | None, consent: dict | None, kind: str) -> str | None:
    """Why new data of this kind can't be recorded for this Scout, or None. Waiting for a first parent consent blocks
    everything; a parent consent older than the notice that added the kind blocks that kind."""
    if is_held(member):
        return HOLD_MESSAGE
    if member and member.get("kind") == "scout" and kind in blocked_kinds(consent):
        return UPDATED_REASON
    return None


def latest_parent_version(consent: dict | None) -> str | None:
    """The newest notice version any parent agreed to for this Scout, or None if no parent has."""
    versions = [e.get("version") for e in (consent or {}).get("parentConsents") or [] if e.get("memberId")]
    return max(versions, key=version_key) if versions else None


def blocked_kinds(consent: dict | None) -> list[str]:
    """The kinds of data that must wait for this Scout. A Scout with no parent consent on record is not held back
    here (Scouts who need a first consent are held by `consentHold` instead)."""
    latest = latest_parent_version(consent)
    if latest is None:
        return []
    return sorted(k for k, added in DATA_KINDS.items() if is_older(latest, added))
