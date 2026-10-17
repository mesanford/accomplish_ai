"""The troop document library: who may see a document, and preparing a public copy. Pure: bytes and dicts only.

A document lives at troops/{t}/documents/{id} with its file at docs/{t}/{id}/{file}. Its visibility decides who
may read both:
  public   listed on the troop website (a copy is made on publish) and open to every troop member
  members  every member of the troop in the app
  leaders  troop leaders only
Medical forms are never public: they can be shared with members or leaders only.
"""

from __future__ import annotations

import io
import re
import zipfile

from .images import UnreadableImage, clean_image

MAX_BYTES = 20 * 1024 * 1024
MAX_PUBLIC_DOCUMENTS = 50
VISIBILITIES = ("public", "members", "leaders")
CATEGORIES = {
    "permission": "Permission slips",
    "gear": "Gear lists",
    "handbook": "Handbook",
    "medical": "Medical forms",
    "other": "Other",
}
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DOC = "application/msword"
IMAGE_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp")
CONTENT_TYPES = ("application/pdf", DOC, DOCX, *IMAGE_TYPES)
PUBLIC_CONTENT_TYPES = ("application/pdf", DOCX, *IMAGE_TYPES)  # old .doc files can't be cleaned, so stay in the app


class UnreadableDocument(ValueError):
    """The file isn't what its type says, or can't be made public."""


def can_be_public(doc: dict) -> bool:
    return doc.get("category") != "medical" and doc.get("contentType") in PUBLIC_CONTENT_TYPES


def is_public(doc: dict | None) -> bool:
    """Whether this document belongs on the public site."""
    return bool(doc) and doc.get("visibility") == "public" and can_be_public(doc)


def who_can_read(doc: dict, roles: set[str], is_member: bool) -> bool:
    """The same rule the Firestore and Storage rules apply, for tests and for code that must agree with them."""
    if roles & {"leader", "scoutmaster", "advancement"}:
        return True
    return is_member and doc.get("visibility") in ("members", "public")


def safe_file_name(name: object) -> str:
    base = str(name or "document").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-.")[:80]
    return cleaned or "document"


def public_doc_path(troop_id: str, doc_id: str, file_name: str) -> str:
    """Where the public copy goes: flat inside the troop's public folder, so storage rules allow anyone to read it."""
    return f"sites/{troop_id}/public/doc-{doc_id}-{safe_file_name(file_name)}"


def _sniff_ok(data: bytes, content_type: str) -> bool:
    if content_type == "application/pdf":
        return data[:1024].lstrip().startswith(b"%PDF-")
    if content_type == DOCX:
        return data.startswith(b"PK\x03\x04")
    if content_type == DOC:
        return data.startswith(b"\xd0\xcf\x11\xe0")
    return True  # images are checked by decoding them


_BLANK_CORE = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    b'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>'
)
_BLANK_APP = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    b'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"/>'
)


def strip_docx_properties(data: bytes) -> bytes:
    """A Word file with its author, company and revision details emptied (docProps/core.xml and app.xml)."""
    try:
        source = zipfile.ZipFile(io.BytesIO(data))
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as target:
            for item in source.infolist():
                body = source.read(item.filename)
                if item.filename == "docProps/core.xml":
                    body = _BLANK_CORE
                elif item.filename == "docProps/app.xml":
                    body = _BLANK_APP
                target.writestr(item.filename, body)
        return out.getvalue()
    except (zipfile.BadZipFile, OSError, RuntimeError, ValueError, NotImplementedError):
        raise UnreadableDocument("That Word file can't be read.") from None


def prepare_public_copy(data: bytes, content_type: str) -> tuple[bytes, str]:
    """(bytes, content type) for the public copy. Images are re-encoded without metadata, Word files lose their
    author properties, and PDFs are copied as they are. Raises UnreadableDocument."""
    if content_type not in PUBLIC_CONTENT_TYPES:
        raise UnreadableDocument("This kind of file can't go on the public site.")
    if len(data) > MAX_BYTES:
        raise UnreadableDocument("That file is over 20 MB.")
    if not _sniff_ok(data, content_type):
        raise UnreadableDocument("That file isn't the kind it says it is.")
    if content_type in IMAGE_TYPES:
        try:
            return clean_image(data)
        except UnreadableImage:
            raise UnreadableDocument("That image can't be read.") from None
    if content_type == DOCX:
        return strip_docx_properties(data), content_type
    return data, content_type


def public_listing(doc_id: str, doc: dict, url: str) -> dict:
    """What the public site shows about a document: no storage path, no uploader."""
    return {
        "id": doc_id,
        "title": doc["title"],
        "category": doc["category"],
        "fileName": safe_file_name(doc.get("fileName")),
        "contentType": doc["contentType"],
        "size": doc.get("size") if isinstance(doc.get("size"), int) else None,
        "url": url,
    }


def sort_documents(docs: list[tuple[str, dict]]) -> list[tuple[str, dict]]:
    order = {name: n for n, name in enumerate(CATEGORIES)}
    return sorted(docs, key=lambda d: (order.get(d[1]["category"], 99), d[1]["title"].lower()))
