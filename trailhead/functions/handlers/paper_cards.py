"""Recording a paper blue card: a card a Scout brought partly or fully signed by a counselor outside Trailhead.

Unlike earlier advancement (`handlers.prior`), this work belongs in the next Scoutbook handoff report. Every
document is stamped `source: "paper"` and `recordedAt`, so the report can tell when it was entered.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from trailhead_core.catalog import Catalog

from .membership import InvalidInput
from .prior import REQ_LABEL

MAX_REQUIREMENTS = 80
MAX_NAME = 80
MAX_EMAIL = 120


@dataclass
class PaperPlan:
    award_id: str
    counselor_name: str
    counselor_email: str | None
    started_on: str
    requirements: dict[str, str] = field(default_factory=dict)  # requirement label -> date signed
    completed_on: str | None = None


def check_date(value, what: str, today: date, earliest: date) -> str:
    """An ISO date that is not in the future and not before the Scout turned 10. `what` names it for the message."""
    label = what[:1].upper() + what[1:]
    try:
        d = date.fromisoformat(str(value)[:10])
    except ValueError as err:
        raise InvalidInput(f"Enter {what} as a date like 2026-05-01.") from err
    if d > today:
        raise InvalidInput(f"{label} can't be in the future.")
    if d < earliest:
        raise InvalidInput(f"{label} is before the Scout turned 10.")
    return d.isoformat()


def _counselor(data: dict) -> tuple[str, str | None]:
    name = " ".join(str(data.get("counselorName") or "").split())
    if not name:
        raise InvalidInput("Enter the counselor's name as it is signed on the card.")
    if len(name) > MAX_NAME:
        raise InvalidInput(f"The counselor's name is longer than {MAX_NAME} characters.")
    email = str(data.get("counselorEmail") or "").strip()
    if email and ("@" not in email or " " in email or len(email) > MAX_EMAIL):
        raise InvalidInput("That counselor email doesn't look right. Leave it empty if you don't have one.")
    return name, email or None


def check_paper_card(data: dict, record: dict, catalog: Catalog, today: date) -> PaperPlan:
    """Validate a leader's entry of one paper blue card."""
    badge_id = data.get("awardId")
    if badge_id not in catalog.badges:
        raise InvalidInput("Choose a merit badge.")
    badge = catalog.badges[badge_id].name
    earliest = date(record["birthYear"] + 10, record["birthMonth"], 1)
    name, email = _counselor(data)
    started = check_date(data.get("startedOn"), "the start date", today, earliest)
    completed_in = data.get("completedOn")
    completed = check_date(completed_in, "the completion date", today, earliest) if completed_in else None

    items = data.get("requirements") or []
    if not isinstance(items, list) or len(items) > MAX_REQUIREMENTS:
        raise InvalidInput(f"Enter at most {MAX_REQUIREMENTS} requirements.")
    plan = PaperPlan(badge_id, name, email, started, completed_on=completed)
    for item in items:
        label = str((item or {}).get("reqId") or "").strip().lower()
        if not REQ_LABEL.match(label):
            raise InvalidInput(f"'{label}' doesn't look like a requirement number. Use forms like 3 or 4b.")
        if label in plan.requirements:
            raise InvalidInput(f"Requirement {label} is listed twice.")
        plan.requirements[label] = check_date(item.get("date"), f"the date for requirement {label}", today, earliest)
    if not plan.requirements and not completed:
        raise InvalidInput(f"List the requirements already signed on the {badge} card, or enter a completion date.")
    if completed and completed < started:
        raise InvalidInput("The completion date is before the start date.")
    early = sorted(label for label, d in plan.requirements.items() if d < started)
    if early:
        raise InvalidInput(f"The date for requirement {early[0]} is before the start date.")
    if completed and any(d > completed for d in plan.requirements.values()):
        raise InvalidInput("A requirement is dated after the completion date.")
    return plan


def noon_utc(day: str) -> datetime:
    return datetime.fromisoformat(day).replace(hour=12, tzinfo=UTC)


def card_doc(scout_id: str, plan: PaperPlan, version_id: str, member_id: str, now: datetime) -> dict:
    return {
        "scoutId": scout_id,
        "awardId": plan.award_id,
        "versionId": version_id,
        "status": "complete" if plan.completed_on else "in_progress",
        "counselorName": plan.counselor_name,
        "counselorEmail": plan.counselor_email,
        "startedOn": plan.started_on,
        "photoPaths": [],
        "source": "paper",
        "recordedAt": now,
        "recordedByMemberId": member_id,
    }


def signoff_doc(scout_id: str, plan: PaperPlan, label: str, version_id: str, leader_uid: str, now: datetime) -> dict:
    return {
        "scoutId": scout_id,
        "awardId": plan.award_id,
        "versionId": version_id,
        "reqId": label,
        "signerUid": leader_uid,
        "onBehalfOf": plan.counselor_name,
        "signedAt": noon_utc(plan.requirements[label]),
        "recordedAt": now,
        "source": "paper",
        "status": "accepted",
    }


def progress_doc(scout_id: str, plan: PaperPlan, version_id: str, signoff_ids: dict[str, str], now: datetime) -> dict:
    requirements = {
        label: {"status": "signed", "signoffId": sid, "onBehalfOf": plan.counselor_name}
        for label, sid in signoff_ids.items()
    }
    doc = {
        "scoutId": scout_id,
        "awardId": plan.award_id,
        "versionId": version_id,
        "status": "in_progress",
        "requirements": requirements,
        "source": "paper",
        "recordedAt": now,
    }
    if plan.completed_on:
        doc.update({"status": "complete", "completedAt": plan.completed_on})
    return doc


def already_started(card: dict | None, progress: dict | None) -> bool:
    """A paper card can't be entered over a card, or finished work, that Trailhead already has."""
    if card is not None and card.get("status") != "cancelled":
        return True
    return progress is not None and progress.get("status") == "complete"
