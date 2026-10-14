"""A small REST client for the Cloud Storage emulator's Firebase API, so storage rules can be tested from Python.

Like the Firestore emulator, it accepts unsigned ID tokens, and the "owner" token bypasses rules.
"""

from __future__ import annotations

import os
from urllib.parse import quote

import requests

from .emulator import PROJECT, token

HOST = os.environ.get("FIREBASE_STORAGE_EMULATOR_HOST", "127.0.0.1:9199")
BUCKET = f"{PROJECT}.appspot.com"
BASE = f"http://{HOST}/v0/b/{BUCKET}/o"
PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


def storage_up() -> bool:
    if not os.environ.get("FIREBASE_STORAGE_EMULATOR_HOST"):
        return False
    try:
        requests.get(f"http://{HOST}/", timeout=2)
        return True
    except requests.RequestException:
        return False


class Storage:
    def __init__(self, uid: str | None):
        if uid == "owner":
            self.headers = {"Authorization": "Bearer owner"}
        elif uid is None:
            self.headers = {}
        else:
            self.headers = {"Authorization": f"Bearer {token(uid)}"}

    def upload(self, path: str, body: bytes = PNG, content_type: str = "image/png") -> int:
        headers = {**self.headers, "Content-Type": content_type}
        url = f"{BASE}?name={quote(path, safe='')}"
        return requests.post(url, data=body, headers=headers, timeout=10).status_code

    def download(self, path: str) -> int:
        url = f"{BASE}/{quote(path, safe='')}?alt=media"
        return requests.get(url, headers=self.headers, timeout=10).status_code

    def delete(self, path: str) -> int:
        return requests.delete(f"{BASE}/{quote(path, safe='')}", headers=self.headers, timeout=10).status_code


def download_public(url: str) -> requests.Response:
    """Fetch a published file's URL with no credentials at all, as a website visitor would."""
    return requests.get(url, timeout=10)


def reset_storage() -> None:
    requests.post(f"http://{HOST}/internal/reset", timeout=10).raise_for_status()
