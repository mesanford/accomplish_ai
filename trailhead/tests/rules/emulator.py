"""A small REST client for the Firestore emulator, so rules can be tested from Python.

The emulator accepts unsigned ID tokens, which lets each call act as a chosen user.
The special "owner" token bypasses rules, for seeding.
"""

from __future__ import annotations

import base64
import json
import os
import time
from datetime import UTC, datetime

import requests

PROJECT = "demo-trailhead"
HOST = os.environ.get("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
DOCS = f"http://{HOST}/v1/projects/{PROJECT}/databases/(default)/documents"


def _b64(obj: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def token(uid: str, **claims) -> str:
    now = int(time.time())
    payload = {
        "iss": f"https://securetoken.google.com/{PROJECT}",
        "aud": PROJECT,
        "sub": uid,
        "user_id": uid,
        "iat": now,
        "exp": now + 3600,
        "auth_time": now,
        "firebase": {"sign_in_provider": "custom", "identities": {}},
        **claims,
    }
    return f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64(payload)}."


def encode(value):
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, datetime):
        return {"timestampValue": value.astimezone(UTC).isoformat().replace("+00:00", "Z")}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        return {"arrayValue": {"values": [encode(v) for v in value]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": {k: encode(v) for k, v in value.items()}}}
    raise TypeError(type(value))


class Client:
    def __init__(self, uid: str | None, **claims):
        if uid == "owner":
            self.headers = {"Authorization": "Bearer owner"}
        elif uid is None:
            self.headers = {}
        else:
            self.headers = {"Authorization": f"Bearer {token(uid, **claims)}"}

    def get(self, path: str) -> int:
        return requests.get(f"{DOCS}/{path}", headers=self.headers, timeout=10).status_code

    def set(self, path: str, data: dict) -> int:
        """Create or fully replace a document."""
        body = {"fields": {k: encode(v) for k, v in data.items()}}
        return requests.patch(f"{DOCS}/{path}", json=body, headers=self.headers, timeout=10).status_code

    def create(self, path: str, data: dict) -> int:
        """Create only: fails if the document exists."""
        collection, _, doc_id = path.rpartition("/")
        body = {"fields": {k: encode(v) for k, v in data.items()}}
        url = f"{DOCS}/{collection}?documentId={doc_id}"
        return requests.post(url, json=body, headers=self.headers, timeout=10).status_code

    def delete(self, path: str) -> int:
        return requests.delete(f"{DOCS}/{path}", headers=self.headers, timeout=10).status_code


def reset() -> None:
    url = f"http://{HOST}/emulator/v1/projects/{PROJECT}/databases/(default)/documents"
    requests.delete(url, timeout=10).raise_for_status()


def decode(value: dict):
    kind, v = next(iter(value.items()))
    if kind == "mapValue":
        return {k: decode(x) for k, x in (v.get("fields") or {}).items()}
    if kind == "arrayValue":
        return [decode(x) for x in v.get("values", [])]
    if kind == "integerValue":
        return int(v)
    return v


def read(path: str) -> dict | None:
    """Read a document as the owner (bypassing rules). None if missing."""
    r = requests.get(f"{DOCS}/{path}", headers={"Authorization": "Bearer owner"}, timeout=10)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return {k: decode(x) for k, x in (r.json().get("fields") or {}).items()}


def list_docs(collection: str) -> list[dict]:
    r = requests.get(f"{DOCS}/{collection}", headers={"Authorization": "Bearer owner"}, timeout=10)
    r.raise_for_status()
    return [{k: decode(x) for k, x in (d.get("fields") or {}).items()} for d in r.json().get("documents", [])]
