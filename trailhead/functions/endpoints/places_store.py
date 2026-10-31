"""Saving the place catalog: write what is new or changed for one source (and state), delete what the source no
longer lists, and count it all for the "places updated" notice. Only the refresh job writes `places`.
"""

from __future__ import annotations

from firebase_admin import firestore

from fb import db
from handlers.places_diff import changes, content_hash

BATCH = 400


def stored(source: str, state: str | None = None) -> dict[str, str]:
    """{place id: hash} of what is stored for a source, or for a source in one state."""
    query = db().collection("places").where("source", "==", source)
    if state:
        query = query.where("state", "==", state)
    return {d.id: (d.to_dict() or {}).get("hash", "") for d in query.select(["hash"]).stream()}


def save(new: dict[str, dict], old: dict[str, str]) -> dict:
    """Write the places that are new or changed, delete the ones that are gone; returns the counts."""
    counts = changes(old, new)
    col, ops = db().collection("places"), []
    for pid, place in new.items():
        h = content_hash(place)
        if old.get(pid) != h:
            ops.append(("set", col.document(pid), {**place, "hash": h, "updatedAt": firestore.SERVER_TIMESTAMP}))
    ops += [("delete", col.document(pid), None) for pid in old if pid not in new]
    for i in range(0, len(ops), BATCH):
        batch = db().batch()
        for kind, ref, data in ops[i : i + BATCH]:
            if kind == "set":
                batch.set(ref, data)
            else:
                batch.delete(ref)
        batch.commit()
    return counts


def add_counts(total: dict | None, more: dict) -> dict:
    total = dict(total or {})
    for key in ("added", "changed", "removed"):
        total[key] = total.get(key, 0) + more.get(key, 0)
    return total
