"""Cloud Storage for the troop website: copy draft images to the public folder and clean up after them."""

from __future__ import annotations

import json
import os
from functools import cache

from handlers.site_build import DEFAULT_STORAGE_HOST, download_url, public_path


def _project() -> str:
    return os.environ.get("GCLOUD_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT") or ""


def bucket_name() -> str:
    """TRAILHEAD_STORAGE_BUCKET, else the default bucket from FIREBASE_CONFIG, else {project}.appspot.com."""
    override = os.environ.get("TRAILHEAD_STORAGE_BUCKET")
    if override:
        return override
    try:
        config = json.loads(os.environ.get("FIREBASE_CONFIG") or "{}")
    except ValueError:
        config = {}
    return config.get("storageBucket") or f"{_project()}.appspot.com"


def _emulator_host() -> str | None:
    host = os.environ.get("FIREBASE_STORAGE_EMULATOR_HOST") or os.environ.get("STORAGE_EMULATOR_HOST")
    if not host:
        return None
    return host if host.startswith("http") else f"http://{host}"


def download_host() -> str:
    return _emulator_host() or DEFAULT_STORAGE_HOST


@cache
def bucket():
    host = _emulator_host()
    if host:
        # The emulator needs no credentials; the Admin SDK's default ones aren't available there.
        import requests
        from google.auth.credentials import AnonymousCredentials
        from google.cloud import storage as gcs

        os.environ.setdefault("STORAGE_EMULATOR_HOST", host)
        # Skip system proxy lookup: on macOS it crashes the emulator's forked workers.
        session = requests.Session()
        session.trust_env = False
        client = gcs.Client(project=_project(), credentials=AnonymousCredentials(), _http=session)
        return client.bucket(bucket_name())
    from firebase_admin import storage

    return storage.bucket(bucket_name())


class MissingFile(Exception):
    def __init__(self, path: str):
        super().__init__(path)
        self.path = path


def publish_files(troop_id: str, draft_paths: list[str]) -> dict[str, str]:
    """Copy each draft file to sites/{t}/public/ and return {draft path: public URL}. Raises MissingFile."""
    b = bucket()
    urls: dict[str, str] = {}
    for path in draft_paths:
        source = b.blob(path)
        if not source.exists():
            raise MissingFile(path)
        source.reload()
        content_type = source.content_type or "application/octet-stream"
        if not content_type.startswith("image/"):
            raise MissingFile(path)
        target_path = public_path(troop_id, path)
        target = b.blob(target_path)
        target.cache_control = "public, max-age=300"
        target.upload_from_string(source.download_as_bytes(), content_type=content_type)
        urls[path] = download_url(bucket_name(), target_path, download_host())
    return urls


def delete_public_files(troop_id: str, keep_urls: set[str] | None = None) -> int:
    """Delete public files that the live site no longer uses (all of them when `keep_urls` is None)."""
    b = bucket()
    removed = 0
    for blob in b.list_blobs(prefix=f"sites/{troop_id}/public/"):
        url = download_url(bucket_name(), blob.name, download_host())
        if keep_urls is not None and url in keep_urls:
            continue
        blob.delete()
        removed += 1
    return removed
