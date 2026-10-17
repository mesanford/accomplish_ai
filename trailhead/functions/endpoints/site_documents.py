"""Documents on the troop website: copy public ones on publish, take them down when they stop being public."""

from __future__ import annotations

import logging

from firebase_functions import firestore_fn

from endpoints.site_files import bucket, bucket_name, delete_public_files, download_host
from fb import db, troop
from handlers.documents import (
    MAX_PUBLIC_DOCUMENTS,
    UnreadableDocument,
    is_public,
    prepare_public_copy,
    public_doc_path,
    public_listing,
    sort_documents,
)
from handlers.site_build import download_url, image_problem, site_urls

log = logging.getLogger(__name__)


def _left_out(doc: dict, reason: str) -> dict:
    return {"path": doc.get("storagePath", ""), "caption": doc["title"], "reason": reason, "kind": "document"}


def publish_documents(troop_id: str, members: dict[str, dict]) -> tuple[list[dict], list[dict], list[dict]]:
    """Copy the troop's public documents to the public folder. Returns (public listing, records of which Scouts each
    image document shows, documents left out with a reason for the leader). A document is left out, not fatal, when
    its image shows a Scout without media consent or its file is missing or unreadable."""
    snaps = troop(troop_id).collection("documents").where("visibility", "==", "public").stream()
    docs = sort_documents([(s.id, s.to_dict()) for s in snaps if is_public(s.to_dict())])
    b = bucket()
    listing: list[dict] = []
    records: list[dict] = []
    left_out: list[dict] = []
    for doc_id, doc in docs[:MAX_PUBLIC_DOCUMENTS]:
        is_image = doc["contentType"].startswith("image/")
        tags = {"scoutIds": doc.get("scoutIds") or [], "noScoutsShown": doc.get("noScoutsShown") is True}
        reason = image_problem(tags, members, "image") if is_image else None
        if reason:
            left_out.append(_left_out(doc, reason))
            continue
        source = b.blob(doc.get("storagePath", ""))
        if not source.exists():
            left_out.append(_left_out(doc, "The file is missing. Upload it again."))
            continue
        try:
            data, content_type = prepare_public_copy(source.download_as_bytes(), doc["contentType"])
        except UnreadableDocument as err:
            left_out.append(_left_out(doc, str(err)))
            continue
        path = public_doc_path(troop_id, doc_id, doc.get("fileName"))
        target = b.blob(path)
        target.cache_control = "public, max-age=300"
        target.upload_from_string(data, content_type=content_type)
        url = download_url(bucket_name(), path, download_host())
        listing.append(public_listing(doc_id, doc, url))
        records.append({"id": doc_id, "url": url, **tags})
    return listing, records, left_out


@firestore_fn.on_document_written(document="troops/{troopId}/documents/{docId}")
def on_document_written_site(event: firestore_fn.Event) -> None:
    """A document that is deleted or no longer public comes off the live site at once. A deleted document's private
    file goes too. New public documents wait for the next publish, like photos."""
    troop_id, doc_id = event.params["troopId"], event.params["docId"]
    if event.data is None or event.data.after is None or not event.data.after.exists:
        for blob in bucket().list_blobs(prefix=f"docs/{troop_id}/{doc_id}/"):
            blob.delete()
    t = troop(troop_id)
    record_ref = t.collection("site").document("published")
    record = record_ref.get().to_dict() or {}
    if not record.get("slug") or not any(d.get("id") == doc_id for d in record.get("documents", [])):
        return
    snap = t.collection("documents").document(doc_id).get()
    if snap.exists and is_public(snap.to_dict()):
        return
    site_ref = db().collection("publicSites").document(record["slug"])
    public = site_ref.get().to_dict()
    if public is None:
        return
    documents = [d for d in public.get("documents", []) if d.get("id") != doc_id]
    site_ref.update({"documents": documents})
    record_ref.update({"documents": [d for d in record["documents"] if d.get("id") != doc_id]})
    delete_public_files(troop_id, keep_urls=site_urls({**public, "documents": documents}))
    log.info("document taken off site troop=%s", troop_id)
