"""Applying a pending sign-off to a Scout's progress."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SignoffOutcome:
    accepted: bool
    reason: str | None
    progress: dict | None  # the new progress document, when accepted


def apply_signoff(signoff_id: str, signoff: dict, progress: dict | None) -> SignoffOutcome:
    """Record a signature on the matching requirement.

    A Scout stays on the requirement version they started. A sign-off made against a
    different version is rejected so a leader can move the Scout deliberately.
    """
    scout_id, award_id, version_id = signoff["scoutId"], signoff["awardId"], signoff["versionId"]
    if progress is None:
        progress = {
            "scoutId": scout_id,
            "awardId": award_id,
            "versionId": version_id,
            "status": "in_progress",
            "requirements": {},
        }
    elif progress.get("versionId") != version_id:
        return SignoffOutcome(
            accepted=False,
            reason=f"Scout is on version {progress.get('versionId')}, sign-off was for {version_id}.",
            progress=None,
        )
    if progress.get("status") == "complete":
        return SignoffOutcome(accepted=False, reason="This award is already complete.", progress=None)

    requirements = dict(progress.get("requirements", {}))
    requirements[signoff["reqId"]] = {"status": "signed", "signoffId": signoff_id}
    updated = {**progress, "status": "in_progress", "requirements": requirements}
    if "needsReview" in progress:
        # A new signature on a requirement flagged after a version move settles that review.
        updated["needsReview"] = [r for r in progress["needsReview"] if r != signoff["reqId"]]
    return SignoffOutcome(accepted=True, reason=None, progress=updated)
