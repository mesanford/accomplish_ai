"""Loads the bundled program content: merit badges and ranks."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

CONTENT_DIR = Path(__file__).parent / "content"


@dataclass(frozen=True)
class Badge:
    id: str
    name: str
    category: str
    difficulty: int
    eagle_required: bool
    eagle_group: str | None
    min_days: int | None = None
    count_target: int | None = None
    count_unit: str | None = None
    prereq_any_of: tuple[str, ...] = ()

    @property
    def counts_toward_eagle(self) -> bool:
        return self.eagle_required or self.eagle_group is not None


@dataclass(frozen=True)
class Rank:
    id: str
    name: str
    order: int
    months_after_previous: int = 0
    total_badges: int = 0
    total_eagle_required: int = 0
    min_days: int | None = None
    before_age: int | None = None


@dataclass(frozen=True)
class Catalog:
    badges: dict[str, Badge]
    ranks: dict[str, Rank]
    eagle_required_slots: int
    eagle_groups: dict[str, tuple[str, ...]] = field(default_factory=dict)

    def rank_after(self, rank_id: str) -> Rank | None:
        order = self.ranks[rank_id].order + 1
        return next((r for r in self.ranks.values() if r.order == order), None)

    def ranks_between(self, current_id: str, goal_id: str) -> list[Rank]:
        """Ranks after `current_id` up to and including `goal_id`, in order."""
        lo, hi = self.ranks[current_id].order, self.ranks[goal_id].order
        return sorted((r for r in self.ranks.values() if lo < r.order <= hi), key=lambda r: r.order)


def _badge(raw: dict) -> Badge:
    return Badge(
        id=raw["id"],
        name=raw["name"],
        category=raw["category"],
        difficulty=raw["difficulty"],
        eagle_required=raw["eagleRequired"],
        eagle_group=raw.get("eagleGroup"),
        min_days=raw.get("minDays"),
        count_target=raw.get("countTarget"),
        count_unit=raw.get("countUnit"),
        prereq_any_of=tuple(raw.get("prereqAnyOf", ())),
    )


def _rank(raw: dict) -> Rank:
    return Rank(
        id=raw["id"],
        name=raw["name"],
        order=raw["order"],
        months_after_previous=raw.get("monthsAfterPrevious", 0),
        total_badges=raw.get("totalBadges", 0),
        total_eagle_required=raw.get("totalEagleRequired", 0),
        min_days=raw.get("minDays"),
        before_age=raw.get("beforeAge"),
    )


@lru_cache(maxsize=1)
def load_catalog() -> Catalog:
    badges_doc = json.loads((CONTENT_DIR / "merit_badges.json").read_text())
    ranks_doc = json.loads((CONTENT_DIR / "ranks.json").read_text())
    badges = {b["id"]: _badge(b) for b in badges_doc["badges"]}
    groups: dict[str, list[str]] = {}
    for b in badges.values():
        if b.eagle_group:
            groups.setdefault(b.eagle_group, []).append(b.id)
    return Catalog(
        badges=badges,
        ranks={r["id"]: _rank(r) for r in ranks_doc["ranks"]},
        eagle_required_slots=ranks_doc["eagleRequiredSlots"],
        eagle_groups={k: tuple(sorted(v)) for k, v in groups.items()},
    )
