"""Troop-made awards: validating edits, deciding when a new version is needed, and moving a Scout
to a newer version. No Firestore calls here."""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass

from handlers.membership import InvalidInput
from trailhead_core.catalog import CUSTOM_AWARD_PREFIX, is_custom_award
from trailhead_core.versioning import Requirement, migrate

MAX_REQUIREMENTS = 60
REQ_ID = re.compile(r"^[a-z0-9-]{1,24}$")


def new_award_id() -> str:
    return CUSTOM_AWARD_PREFIX + secrets.token_hex(6)


def check_award_id(award_id) -> str:
    if not isinstance(award_id, str) or not is_custom_award(award_id):
        raise InvalidInput("Choose one of your troop's awards.")
    return award_id


def _text(value, label: str, max_len: int, required: bool = True) -> str:
    text = value.strip() if isinstance(value, str) else ""
    if required and not text:
        raise InvalidInput(f"{label} is required.")
    if len(text) > max_len:
        raise InvalidInput(f"{label} must be {max_len} characters or fewer.")
    return text


def clean_requirements(raw) -> list[dict]:
    """Requirements in order. Rows keep their id when they have a valid one; new rows get a fresh id."""
    if not isinstance(raw, list) or not raw:
        raise InvalidInput("Add at least one requirement.")
    if len(raw) > MAX_REQUIREMENTS:
        raise InvalidInput(f"An award can have at most {MAX_REQUIREMENTS} requirements.")
    cleaned: list[dict] = []
    labels: set[str] = set()
    ids: set[str] = set()
    for n, row in enumerate(raw, start=1):
        row = row if isinstance(row, dict) else {}
        label = _text(row.get("label"), f"Requirement {n} number", 12)
        text = _text(row.get("text"), f"Requirement {label}", 1000)
        if label.lower() in labels:
            raise InvalidInput(f"Two requirements are numbered {label}. Give each one its own number.")
        req_id = row.get("id")
        if not isinstance(req_id, str) or not REQ_ID.match(req_id) or req_id in ids:
            req_id = "r" + secrets.token_hex(4)
        labels.add(label.lower())
        ids.add(req_id)
        cleaned.append({"id": req_id, "label": label, "text": text})
    return cleaned


@dataclass
class AwardEdit:
    name: str
    description: str
    requirements: list[dict]
    note: str


def clean_award(data: dict) -> AwardEdit:
    return AwardEdit(
        name=_text(data.get("name"), "Award name", 80),
        description=_text(data.get("description"), "Description", 500, required=False),
        requirements=clean_requirements(data.get("requirements")),
        note=_text(data.get("note"), "Version note", 200, required=False),
    )


def _shape(reqs: list[dict]) -> list[tuple[str, str, str]]:
    return [(r["id"], r["label"], r["text"]) for r in reqs]


def requirements_changed(old: list[dict] | None, new: list[dict]) -> bool:
    """Any added, removed, reworded, renumbered or reordered requirement makes a new version."""
    return old is None or _shape(old) != _shape(new)


def next_version_id(award: dict | None) -> str:
    return f"v{int((award or {}).get('versionCount', 0)) + 1}"


@dataclass
class SavePlan:
    award: dict  # fields to merge into the award document
    version_id: str | None  # the new version's id, when one is needed
    version: dict | None  # the new version document (without timestamps)


def plan_save(edit: AwardEdit, award: dict | None, current_reqs: list[dict] | None, member_id: str) -> SavePlan:
    """Name and description edits change the award in place. Requirement edits add a version, so
    Scouts already working on the award keep the requirements they started with."""
    if award is not None and award.get("archived"):
        raise InvalidInput("This award is archived. Restore it before editing.")
    fields = {"name": edit.name, "description": edit.description}
    if award is not None and not requirements_changed(current_reqs, edit.requirements):
        return SavePlan(award=fields, version_id=None, version=None)
    version_id = next_version_id(award)
    version = {"requirements": edit.requirements, "createdByMemberId": member_id, "note": edit.note}
    fields |= {"currentVersionId": version_id, "versionCount": int(version_id[1:])}
    if award is None:
        fields |= {"createdByMemberId": member_id, "archived": False}
    return SavePlan(award=fields, version_id=version_id, version=version)


def _reqs(raw: list[dict]) -> list[Requirement]:
    return [Requirement(r["id"], r["label"], r["text"]) for r in raw]


@dataclass
class Move:
    progress: dict  # the Scout's progress document on the new version
    summary: dict  # what carried over, what needs a leader's review, what was dropped (as labels)


def move_progress(progress: dict | None, old_reqs: list[dict], new_reqs: list[dict], new_version_id: str) -> Move:
    """Carry signed and ready requirements whose number and wording didn't change. Reworded ones are
    flagged for review rather than guessed, because they may ask for different work."""
    if progress is None:
        raise InvalidInput("This Scout hasn't started the award yet, so there is nothing to move.")
    if progress.get("status") == "complete":
        raise InvalidInput("This award is already complete. Completed awards stay on their version.")
    if progress.get("versionId") == new_version_id:
        raise InvalidInput("This Scout is already on the latest version.")
    entries = progress.get("requirements") or {}
    statuses = {rid: e.get("status") for rid, e in entries.items() if isinstance(e, dict) and e.get("status")}
    result = migrate(statuses, _reqs(old_reqs), _reqs(new_reqs))
    old_by_label = {r["label"]: r["id"] for r in old_reqs}
    new_by_id = {r["id"]: r for r in new_reqs}
    old_by_id = {r["id"]: r for r in old_reqs}
    carried = {new_id: dict(entries[old_by_label[new_by_id[new_id]["label"]]]) for new_id in result.carried}
    moved = {
        **progress,
        "versionId": new_version_id,
        "previousVersionId": progress.get("versionId"),
        "requirements": carried,
        "needsReview": list(result.needs_review),
    }
    summary = {
        "fromVersionId": progress.get("versionId"),
        "toVersionId": new_version_id,
        "carried": [new_by_id[i]["label"] for i in result.carried],
        "needsReview": [new_by_id[i]["label"] for i in result.needs_review],
        "dropped": [old_by_id[i]["label"] for i in result.dropped],
    }
    return Move(progress=moved, summary=summary)
