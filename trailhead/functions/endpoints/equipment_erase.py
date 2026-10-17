"""Equipment records when people leave, and the nightly rule that deletes old history.

When a Scout is erased, or an adult deletes their account, their loans and requests stay for the troop's gear
history but lose the person: the name becomes "Former Scout" (or "Former member") and every id that pointed at them
is removed. Open loans block nothing and still show as out, to a former person. The inventory itself goes with the
troop (`retire_troop` deletes every subcollection and the gear photos). Returned loans, answered requests and repair
notes are deleted 7 years after they were closed.
"""

from __future__ import annotations

import logging
from datetime import date

from firebase_admin import firestore

from endpoints.erase import commit, delete_op, update_op
from handlers.equipment import FORMER_MEMBER, FORMER_SCOUT, HISTORY_YEARS, history_due
from handlers.retention import query_cutoff

log = logging.getLogger(__name__)
GONE = firestore.DELETE_FIELD


def holder_ops(t, member_id: str, kind: str) -> list:
    """Writes that take a person's name and ids off the troop's loans, requests and repair notes. One write per
    document, however many of its fields name the person."""
    label = FORMER_SCOUT if kind == "scout" else FORMER_MEMBER
    loans, requests = t.collection("checkouts"), t.collection("equipmentRequests")
    changes: dict[str, tuple[object, dict]] = {}

    def change(query, fields: dict) -> None:
        for snap in query.stream():
            ref, merged = changes.get(snap.reference.path, (snap.reference, {}))
            changes[snap.reference.path] = (ref, {**merged, **fields})

    holder = {"toLabel": label, "holderFormer": True, "toMemberId": GONE, "scoutId": GONE}
    change(loans.where("toMemberId", "==", member_id), holder)
    change(loans.where("outById", "==", member_id), {"outById": GONE})
    change(loans.where("returnedById", "==", member_id), {"returnedById": GONE})
    asker = {"requestedByName": label, "holderFormer": True, "requestedByMemberId": GONE, "requestedByUid": GONE}
    change(requests.where("requestedByMemberId", "==", member_id), asker)
    change(requests.where("decidedById", "==", member_id), {"decidedById": GONE})
    change(t.collection("maintenance").where("byMemberId", "==", member_id), {"byMemberId": GONE})
    return [update_op(ref, fields) for ref, fields in changes.values()]


def equipment(t, troop_id: str, today: date, budget) -> tuple[int, int]:
    """The nightly rule: delete closed loans, answered requests and repair notes 7 years after they were closed."""
    if budget.equipment <= 0:
        log.info("retention rule=equipment troop=%s skipped=budget", troop_id)
        return 0, 0
    cutoff = query_cutoff(today, HISTORY_YEARS * 12)
    kinds = (("checkouts", "returnedAt"), ("equipmentRequests", "decidedAt"), ("maintenance", "createdAt"))
    refs = []
    for name, field in kinds:
        old = t.collection(name).where(field, "<", cutoff).order_by(field).limit(budget.equipment)
        refs += [s.reference for s in old.stream() if history_due(s.to_dict().get(field), today)]
    refs = refs[: budget.equipment]
    commit([delete_op(ref) for ref in refs])
    budget.equipment -= len(refs)
    log.info("retention rule=equipment troop=%s due=%d deleted=%d", troop_id, len(refs), len(refs))
    return len(refs), len(refs)
