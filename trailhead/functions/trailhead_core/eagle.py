"""Counting Eagle-required badges, including the three choose-one groups."""

from __future__ import annotations

from collections.abc import Iterable

from .catalog import Catalog


def eagle_slots_filled(badge_ids: Iterable[str], catalog: Catalog) -> int:
    """Eagle-required slots covered. A choose-one group fills one slot, however many members are earned."""
    ids = set(badge_ids)
    fixed = sum(1 for b in catalog.badges.values() if b.eagle_required and b.id in ids)
    groups = sum(1 for members in catalog.eagle_groups.values() if ids.intersection(members))
    return fixed + groups


def missing_eagle_required(badge_ids: Iterable[str], catalog: Catalog) -> list[str]:
    """Names of required badges (or groups, as "A or B") not yet in the set, alphabetical."""
    ids = set(badge_ids)
    missing = [b.name for b in catalog.badges.values() if b.eagle_required and b.id not in ids]
    for members in catalog.eagle_groups.values():
        if not ids.intersection(members):
            missing.append(" or ".join(catalog.badges[m].name for m in members))
    return sorted(missing)
