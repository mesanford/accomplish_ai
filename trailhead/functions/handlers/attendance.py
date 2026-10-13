"""Turning event attendance into activity logs and requirements ready for sign-off."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AttendanceEffects:
    log: dict | None  # activity log document, or None when there is nothing to log
    ready: list[tuple[str, str]] = field(default_factory=list)  # (awardId, reqId) to mark ready


def attendance_effects(event_id: str, event: dict, member: dict, present: bool) -> AttendanceEffects:
    """Only Scouts who were present get logs and ready requirements."""
    if not present or member.get("kind") != "scout":
        return AttendanceEffects(log=None)
    values = {k: v for k, v in (event.get("logValues") or {}).items() if v}
    log = None
    if values:
        log = {
            "scoutId": member["id"],
            "eventId": event_id,
            "date": event.get("start"),
            "nights": values.get("nights", 0),
            "miles": values.get("miles", 0),
            "serviceHours": values.get("serviceHours", 0),
        }
    ready = [(r["awardId"], r["reqId"]) for r in event.get("linkedRequirements", [])]
    return AttendanceEffects(log=log, ready=ready)


def mark_ready(progress: dict | None, scout_id: str, award_id: str, version_id: str, req_id: str) -> dict | None:
    """Return updated progress with the requirement marked ready, or None if nothing changes.

    Never downgrades a signed requirement.
    """
    progress = progress or {
        "scoutId": scout_id,
        "awardId": award_id,
        "versionId": version_id,
        "status": "in_progress",
        "requirements": {},
    }
    current = progress.get("requirements", {}).get(req_id, {})
    if current.get("status") in ("signed", "ready"):
        return None
    requirements = {**progress.get("requirements", {}), req_id: {"status": "ready"}}
    return {**progress, "requirements": requirements}
