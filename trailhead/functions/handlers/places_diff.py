"""What changed in the place catalog between refreshes, for the "places updated" notice. Pure functions."""

from __future__ import annotations

import hashlib
import json


def content_hash(place: dict) -> str:
    keep = {k: v for k, v in place.items() if k not in ("seenRun", "hash", "updatedAt")}
    return hashlib.sha1(json.dumps(keep, sort_keys=True).encode()).hexdigest()[:16]


def changes(old: dict[str, str], new: dict[str, dict]) -> dict:
    """Added, changed and removed counts, from the stored hashes and the new places."""
    added = sum(1 for pid in new if pid not in old)
    changed = sum(1 for pid, p in new.items() if pid in old and old[pid] != content_hash(p))
    removed = sum(1 for pid in old if pid not in new)
    return {"added": added, "changed": changed, "removed": removed}
