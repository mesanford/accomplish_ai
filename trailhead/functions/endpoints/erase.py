"""Shared helpers for erasing data: batched Firestore writes and Cloud Storage deletes.

The Admin SDK bypasses security rules, so the rules can keep refusing client deletes of these documents.
"""

from __future__ import annotations

from google.api_core.exceptions import NotFound

from endpoints.site_files import bucket
from fb import db
from handlers.removal import chunked

Op = tuple[str, object, dict | None]  # ("delete" | "update", document reference, fields for an update)


def delete_op(ref) -> Op:
    return ("delete", ref, None)


def update_op(ref, fields: dict) -> Op:
    return ("update", ref, fields)


def commit(ops: list[Op]) -> None:
    """Apply the writes in batches that stay under Firestore's 500-write limit."""
    for group in chunked(ops):
        batch = db().batch()
        for kind, ref, fields in group:
            if kind == "delete":
                batch.delete(ref)
            else:
                batch.update(ref, fields)
        batch.commit()


def delete_folder(prefix: str) -> int:
    """Delete every Storage file whose path starts with `prefix`."""
    removed = 0
    for blob in bucket().list_blobs(prefix=prefix):
        blob.delete()
        removed += 1
    return removed


def delete_files(paths: list[str]) -> int:
    removed = 0
    for path in paths:
        try:
            bucket().blob(path).delete()
            removed += 1
        except NotFound:
            continue
    return removed
