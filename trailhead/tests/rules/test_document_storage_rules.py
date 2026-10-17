"""Storage rules for the document library: docs/{t}/{id}/{file}. Visibility is read from the document in Firestore."""

import pytest

from .conftest import T
from .emulator import Client
from .storage import Storage, reset_storage, storage_up

OK, DENIED = 200, 403
PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
FILE = "docs/t1/d1/gear.pdf"

pytestmark = pytest.mark.skipif(not storage_up(), reason="Storage emulator not running; use `firebase emulators:exec`")


@pytest.fixture(autouse=True)
def clean_bucket():
    reset_storage()
    yield


def seed(visibility: str, doc_id: str = "d1") -> str:
    """A document record with this visibility and its file in Storage. Returns the file path."""
    path = f"docs/t1/{doc_id}/gear.pdf"
    record = {
        "title": "Gear list",
        "category": "gear",
        "visibility": visibility,
        "fileName": "gear.pdf",
        "contentType": PDF,
        "size": 10,
        "storagePath": path,
        "createdBy": "leader",
    }
    assert Client("owner").set(f"{T}/documents/{doc_id}", record) == OK
    assert Storage("owner").upload(path, b"%PDF-1.7", PDF) == OK
    return path


def test_leaders_upload_read_and_delete_documents():
    leader = Storage("leader")
    assert leader.upload(FILE, b"%PDF-1.7", PDF) == OK  # before the record exists, as in the app's upload order
    assert leader.download(FILE) == OK
    assert leader.delete(FILE) in (OK, 204)


def test_visibility_decides_who_reads_the_file():
    private, members, public = seed("leaders", "p"), seed("members", "m"), seed("public", "u")
    for uid in ("leader", "assistant", "chair"):
        assert [Storage(uid).download(f) for f in (private, members, public)] == [OK, OK, OK]
    for uid in ("parent", "scout1", "counselor"):
        assert Storage(uid).download(private) == DENIED
        assert Storage(uid).download(members) == OK
        assert Storage(uid).download(public) == OK
    for uid in ("stranger", None):
        assert [Storage(uid).download(f) for f in (private, members, public)] == [DENIED, DENIED, DENIED]


def test_changing_visibility_takes_effect_for_the_file():
    path = seed("members")
    assert Storage("parent").download(path) == OK
    assert Client("leader").set(f"{T}/documents/d1", {**_record(path), "visibility": "leaders"}) == OK
    assert Storage("parent").download(path) == DENIED
    assert Storage("leader").download(path) == OK


def _record(path: str) -> dict:
    return {
        "title": "Gear list",
        "category": "gear",
        "fileName": "gear.pdf",
        "contentType": PDF,
        "size": 10,
        "storagePath": path,
        "createdBy": "leader",
    }


def test_a_file_with_no_record_is_readable_by_leaders_only():
    assert Storage("leader").upload("docs/t1/orphan/gear.pdf", b"%PDF-1.7", PDF) == OK
    assert Storage("parent").download("docs/t1/orphan/gear.pdf") == DENIED
    assert Storage("leader").download("docs/t1/orphan/gear.pdf") == OK


def test_only_leaders_write_or_delete_documents():
    path = seed("public")
    for uid in ("parent", "scout1", "counselor", "stranger", None):
        assert Storage(uid).upload("docs/t1/d2/new.pdf", b"%PDF-1.7", PDF) == DENIED
        assert Storage(uid).upload(path, b"%PDF-evil", PDF) == DENIED
        assert Storage(uid).delete(path) == DENIED


def test_leaders_cannot_use_another_troops_folder():
    assert Storage("leader").upload("docs/t2/d1/gear.pdf", b"%PDF-1.7", PDF) == DENIED


def test_uploads_must_be_documents_or_images_up_to_20_mb():
    leader = Storage("leader")
    assert leader.upload("docs/t1/a/f.docx", b"PK\x03\x04", DOCX) == OK
    assert leader.upload("docs/t1/a/f.doc", b"\xd0\xcf\x11\xe0", "application/msword") == OK
    assert leader.upload("docs/t1/a/f.png", b"\x89PNG", "image/png") == OK
    assert leader.upload("docs/t1/a/f.html", b"<script>", "text/html") == DENIED
    assert leader.upload("docs/t1/a/f.zip", b"PK", "application/zip") == DENIED
    assert leader.upload("docs/t1/a/f.txt", b"hello", "text/plain") == DENIED
    assert leader.upload("docs/t1/a/big.pdf", b"\0" * (20 * 1024 * 1024 + 1), PDF) == DENIED
    assert leader.upload("docs/t1/a/ok.pdf", b"\0" * (20 * 1024 * 1024), PDF) == OK


def test_the_public_folder_is_still_server_written_only():
    seed("public")
    assert Storage("leader").upload("sites/t1/public/doc-d1-gear.pdf", b"%PDF-1.7", PDF) == DENIED
    assert Storage("owner").upload("sites/t1/public/doc-d1-gear.pdf", b"%PDF-1.7", PDF) == OK
    assert Storage(None).download("sites/t1/public/doc-d1-gear.pdf") == OK
