"""Storage rules for troop website images. Needs the Storage and Firestore emulators (the rules read access docs)."""

import pytest

from .storage import Storage, reset_storage, storage_up

OK, DENIED = 200, 403
DRAFT = "sites/t1/draft/cover.png"
PUBLIC = "sites/t1/public/cover.png"

pytestmark = pytest.mark.skipif(not storage_up(), reason="Storage emulator not running; use `firebase emulators:exec`")


@pytest.fixture(autouse=True)
def clean_bucket():
    reset_storage()
    yield


def test_leaders_upload_and_read_draft_images():
    leader = Storage("leader")
    assert leader.upload(DRAFT) == OK
    assert leader.download(DRAFT) == OK
    assert leader.delete(DRAFT) in (OK, 204)


def test_other_members_and_strangers_cannot_touch_drafts():
    assert Storage("owner").upload(DRAFT) == OK
    for uid in ("parent", "scout1", "counselor", "stranger", None):
        assert Storage(uid).upload("sites/t1/draft/mine.png") == DENIED
        assert Storage(uid).download(DRAFT) == DENIED
        assert Storage(uid).delete(DRAFT) == DENIED


def test_leaders_cannot_use_another_troops_folder():
    assert Storage("leader").upload("sites/t2/draft/cover.png") == DENIED


def test_draft_uploads_must_be_small_images():
    leader = Storage("leader")
    assert leader.upload("sites/t1/draft/notes.txt", b"hello", "text/plain") == DENIED
    assert leader.upload("sites/t1/draft/page.html", b"<script>", "text/html") == DENIED
    assert leader.upload("sites/t1/draft/huge.png", b"\0" * (8 * 1024 * 1024 + 1)) == DENIED
    assert leader.upload("sites/t1/draft/photo.jpg", b"\xff\xd8\xff", "image/jpeg") == OK


def test_public_copies_are_readable_by_anyone_but_written_only_by_the_server():
    assert Storage("owner").upload(PUBLIC) == OK
    assert Storage(None).download(PUBLIC) == OK
    assert Storage("stranger").download(PUBLIC) == OK
    for uid in ("leader", "stranger", None):
        assert Storage(uid).upload(PUBLIC) == DENIED
        assert Storage(uid).delete(PUBLIC) == DENIED


def test_everything_else_is_closed():
    assert Storage("owner").upload("other/file.png") == OK
    for uid in ("leader", "stranger", None):
        assert Storage(uid).download("other/file.png") == DENIED
        assert Storage(uid).upload("other/new.png") == DENIED
        assert Storage(uid).upload("sites/t1/draft/nested/deep.png") == DENIED
