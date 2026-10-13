"""Moving a Scout's progress from one requirement version to another."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Requirement:
    id: str
    label: str  # as printed, e.g. "4b"
    text: str


@dataclass
class Migration:
    carried: dict[str, str]  # new requirement id -> status kept from the old version
    needs_review: list[str]  # new requirement ids a leader must look at
    dropped: list[str]  # old requirement ids with progress that no longer exist


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def migrate(progress: dict[str, str], old: list[Requirement], new: list[Requirement]) -> Migration:
    """Carry progress only where the label and the wording are unchanged.

    Anything else is flagged for a leader instead of guessed, because a changed requirement
    may ask for different work.
    """
    old_by_label = {r.label: r for r in old}
    carried: dict[str, str] = {}
    needs_review: list[str] = []
    matched_old: set[str] = set()
    for req in new:
        prior = old_by_label.get(req.label)
        if prior is None:
            continue
        status = progress.get(prior.id)
        if status is None:
            continue
        matched_old.add(prior.id)
        if _norm(prior.text) == _norm(req.text):
            carried[req.id] = status
        else:
            needs_review.append(req.id)
    dropped = [r.id for r in old if r.id in progress and r.id not in matched_old]
    return Migration(carried=carried, needs_review=needs_review, dropped=dropped)
