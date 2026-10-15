"""Planning what to erase when a Scout leaves the troop. No Firestore calls here.

Each function takes the documents that could mention the Scout and says what to delete or rewrite. The
endpoint (`endpoints/removal.py`) gathers the documents and applies the plan.
"""

from __future__ import annotations

from dataclasses import dataclass, field

BATCH_SIZE = 400  # Firestore allows 500 writes per batch; leave room


def chunked(items: list, size: int = BATCH_SIZE) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def card_folder(troop_id: str, scout_id: str) -> str:
    """Storage folder holding photos of this Scout's paper blue cards (see storage.rules)."""
    return f"cards/{troop_id}/{scout_id}/"


@dataclass
class AccessPlan:
    delete_uids: list[str] = field(default_factory=list)  # logins that exist only for this Scout
    new_scout_ids: dict[str, list[str]] = field(default_factory=dict)  # uid -> scoutIds without this Scout
    new_pending: dict[str, list[str]] = field(default_factory=dict)  # uid -> Scouts a parent still has to agree for


def plan_access(scout_id: str, access_docs: dict[str, dict]) -> AccessPlan:
    """A Scout's own login loses access. A parent's login keeps access to their other children."""
    plan = AccessPlan()
    for uid, access in access_docs.items():
        ids = list(access.get("scoutIds", []))
        if access.get("memberId") == scout_id:
            plan.delete_uids.append(uid)
        elif scout_id in ids:
            plan.new_scout_ids[uid] = [s for s in ids if s != scout_id]
            if scout_id in access.get("consentPendingScoutIds", []):
                plan.new_pending[uid] = [s for s in access["consentPendingScoutIds"] if s != scout_id]
    return plan


def plan_invites(scout_id: str, invites: dict[str, dict]) -> tuple[list[str], dict[str, list[str]]]:
    """(invites to delete, invite id -> scoutIds without this Scout). Used or not, an invite that only
    exists for this Scout has no purpose left; one shared with siblings keeps working for them."""
    delete: list[str] = []
    trim: dict[str, list[str]] = {}
    for code, invite in invites.items():
        ids = list(invite.get("scoutIds", []))
        if invite.get("scoutMemberId") == scout_id:
            delete.append(code)
        elif scout_id in ids:
            rest = [s for s in ids if s != scout_id]
            if rest or invite.get("leadId"):
                trim[code] = rest
            else:
                delete.append(code)
    return delete, trim


def plan_threads(member_id: str, uid: str | None, threads: dict[str, dict]) -> dict[str, dict]:
    """thread id -> new membership fields. The messages stay as a record of what the adults said (Youth
    Protection), but this person no longer belongs to the conversation or can read it."""
    updates: dict[str, dict] = {}
    for thread_id, thread in threads.items():
        members = list(thread.get("memberIds", []))
        readers = list(thread.get("participantUids", []))
        if member_id not in members and not (uid and uid in readers):
            continue
        updates[thread_id] = {
            "memberIds": [m for m in members if m != member_id],
            "participantUids": [u for u in readers if u != uid],
            "yptAddedMemberIds": [m for m in thread.get("yptAddedMemberIds", []) if m != member_id],
        }
    return updates


def plan_draft_gallery(scout_id: str, draft: dict | None) -> tuple[list[dict] | None, list[str]]:
    """(new draft gallery, or None if unchanged; draft files to delete).

    A photo tagged with only this Scout is removed. A photo that also shows other Scouts stays; its tag now
    names someone who is gone, so the next publish leaves it out until a leader fixes the tags.
    """
    draft = draft or {}
    gallery = list(draft.get("gallery") or [])
    in_use = {(draft.get("theme") or {}).get("logoPath"), (draft.get("cover") or {}).get("photoPath")}
    kept, files = [], []
    for item in gallery:
        if item.get("scoutIds") == [scout_id] and not item.get("noScoutsShown"):
            if item.get("path") and item["path"] not in in_use:
                files.append(item["path"])
        else:
            kept.append(item)
    return (kept if len(kept) != len(gallery) else None), files


def plan_exports(scout_id: str, exports: dict[str, dict]) -> tuple[list[str], dict[str, dict]]:
    """Scoutbook handoff reports list advancement by Scout. (reports left empty, report id -> new fields)."""
    delete: list[str] = []
    updates: dict[str, dict] = {}
    for report_id, report in exports.items():
        rows = report.get("rows", [])
        rest = [r for r in rows if r.get("scoutId") != scout_id]
        before = report.get("enteredScoutIds", [])
        entered = [s for s in before if s != scout_id]
        if len(rest) == len(rows) and len(entered) == len(before):
            continue
        if not rest:
            delete.append(report_id)
        else:
            updates[report_id] = {"rows": rest, "rowCount": len(rest), "enteredScoutIds": entered}
    return delete, updates


def usage_ids(uid: str | None, ids: list[str]) -> list[str]:
    """Draft-limit counters kept for one login (see `usage_doc_id`)."""
    if not uid:
        return []
    return [i for i in ids if i.startswith(f"{uid}_") or i.startswith(f"about_{uid}_")]
