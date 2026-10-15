"""Deleting a whole troop that nobody has used for 18 months. Called by the retention job only.

Until the operator turns dry run off (TRAILHEAD_RETENTION_DRY_RUN, see DEPLOY.md) this only logs what it would
delete. Order matters so a failed run can repeat the next day: files, the public site and the members' troop
lists first, then every subcollection, and the troop document last (it is how the job finds the troop again).
Auth logins are not touched; a person whose only troop this was can still sign in and create or join another.
"""

from __future__ import annotations

import logging
from contextlib import suppress
from datetime import date

from firebase_admin import firestore
from google.api_core.exceptions import NotFound

from endpoints.erase import delete_folder
from endpoints.site_files import bucket
from fb import db, troop
from handlers.retention import troop_due, troop_last_active

log = logging.getLogger(__name__)


def _prefixes(troop_id: str) -> list[str]:
    """Storage folders for the troop (see storage.rules): paper blue card photos and the website."""
    return [f"cards/{troop_id}/", f"sites/{troop_id}/"]


def _logins(t) -> list[str]:
    uids = {d.id for d in t.collection("access").list_documents()}
    uids |= {m.get("uid") for m in (d.to_dict() for d in t.collection("members").stream()) if m.get("uid")}
    return sorted(uids)


def _site_refs(troop_id: str, troop_doc: dict) -> list:
    """The troop's public site and web address documents (current slug, plus any it owned before)."""
    slugs = {d.id for d in db().collection("slugs").where("troopId", "==", troop_id).stream()}
    current = (troop_doc.get("site") or {}).get("slug")
    refs = [db().collection("slugs").document(s) for s in slugs]
    sites = {d.id for d in db().collection("publicSites").where("troopId", "==", troop_id).stream()}
    if current:
        sites.add(current)
    return refs + [db().collection("publicSites").document(s) for s in sorted(sites)]


def inventory(troop_id: str, troop_doc: dict) -> dict:
    """What deleting the troop would remove: document counts per top-level collection, files, logins, site docs."""
    t = troop(troop_id)
    collections = {c.id: c.count().get()[0][0].value for c in t.collections()}
    files = sum(1 for p in _prefixes(troop_id) for _ in bucket().list_blobs(prefix=p))
    return {
        "collections": dict(sorted(collections.items())),
        "files": files,
        "logins": len(_logins(t)),
        "siteDocs": len(_site_refs(troop_id, troop_doc)),
    }


def retire_troop(troop_id: str, today: date, dry_run: bool) -> bool:
    """Delete the troop if it is still due (rechecked here, in case someone used it since the job started).
    Returns True if the troop was deleted. In dry run, logs the inventory and deletes nothing."""
    t = troop(troop_id)
    troop_doc = t.get().to_dict()
    if troop_doc is None or not troop_due(troop_doc, today):
        return False
    last = troop_last_active(troop_doc)
    found = inventory(troop_id, troop_doc)
    log.warning(
        "retention rule=troop troop=%s dry_run=%s last_active=%s would_delete=%s",
        troop_id,
        dry_run,
        last,
        found,
    )
    if dry_run:
        return False

    files = sum(delete_folder(p) for p in _prefixes(troop_id))
    for ref in _site_refs(troop_id, troop_doc):
        ref.delete()
    for uid in _logins(t):
        with suppress(NotFound):  # never recreate a users document for a deleted account
            db().collection("users").document(uid).update({f"troops.{troop_id}": firestore.DELETE_FIELD})
    docs = sum(db().recursive_delete(c) for c in t.collections())
    t.delete()
    log.warning("retention rule=troop troop=%s deleted docs=%d files=%d", troop_id, docs + 1, files)
    return True
