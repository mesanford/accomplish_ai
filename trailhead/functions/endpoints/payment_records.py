"""Card payment records over time, kept in step with the ledger they belong to.

- A removed Scout: paid records move to the Scout's reference account with the ledger; checkouts that never paid are
  deleted (no money moved, so there is nothing to keep).
- A deleted adult: their uid comes off the payments they started. The records stay.
- Retention: a record is deleted 7 years after its date, like ledger entries, with its lookup document.
"""

from __future__ import annotations

from datetime import date

from endpoints.erase import delete_op, update_op
from fb import db
from handlers.ledger_lifecycle import entry_due, former_id, ledger_cutoff

LOOKUP = "stripeLookup"


def removal_ops(t, scout_id: str, ref: str | None) -> list:
    """Writes for a removed Scout's payment records. `ref` is their reference number, or None if no entries stay."""
    ops = []
    for snap in t.collection("payments").where("scoutId", "==", scout_id).stream():
        record = snap.to_dict() or {}
        if ref and record.get("ledgerEntryId"):
            ops.append(update_op(snap.reference, {"scoutId": former_id(ref), "scoutRef": ref, "anonymized": True}))
        else:
            ops.append(delete_op(snap.reference))
    return ops


def forget_payer_ops(t, uid: str) -> list:
    query = t.collection("payments").where("createdBy", "==", uid)
    return [update_op(d.reference, {"createdBy": "former-member"}) for d in query.stream()]


def purge_ops(t, today: date, limit: int) -> list:
    """Deletes for payment records 7 years past their date (the ledger's rule), at most `limit` records."""
    ops = []
    for snap in t.collection("payments").where("date", "<", ledger_cutoff(today)).limit(limit).stream():
        record = snap.to_dict() or {}
        if not entry_due(record, today):
            continue
        intent = record.get("paymentIntentId")
        if intent:
            ops.append(delete_op(db().collection(LOOKUP).document(intent)))
        ops.append(delete_op(snap.reference))
    return ops
