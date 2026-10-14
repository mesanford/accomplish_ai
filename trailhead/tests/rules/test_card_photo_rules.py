"""Storage rules for photos of paper blue cards. Needs the Storage and Firestore emulators."""

import pytest

from .storage import Storage, reset_storage, storage_up

OK, DENIED = 200, 403
PHOTO = "cards/t1/s1/s1_archery/card.png"

pytestmark = pytest.mark.skipif(not storage_up(), reason="Storage emulator not running; use `firebase emulators:exec`")


@pytest.fixture(autouse=True)
def clean_bucket():
    reset_storage()
    yield


def test_leaders_upload_read_and_delete_card_photos():
    leader = Storage("leader")
    assert leader.upload(PHOTO) == OK
    assert leader.download(PHOTO) == OK
    assert leader.upload("cards/t1/s1/s1_archery/scan.pdf", b"%PDF-1.4", "application/pdf") == OK
    assert leader.delete(PHOTO) in (OK, 204)


def test_the_scout_and_their_parent_read_but_do_not_write():
    assert Storage("owner").upload(PHOTO) == OK
    for uid in ("scout1", "parent"):
        assert Storage(uid).download(PHOTO) == OK
        assert Storage(uid).upload("cards/t1/s1/s1_archery/mine.png") == DENIED
        assert Storage(uid).delete(PHOTO) == DENIED


def test_everyone_else_is_shut_out():
    assert Storage("owner").upload(PHOTO) == OK
    for uid in ("stranger", "counselor", None):
        assert Storage(uid).download(PHOTO) == DENIED
        assert Storage(uid).upload("cards/t1/s1/s1_archery/mine.png") == DENIED
        assert Storage(uid).delete(PHOTO) == DENIED


def test_a_family_cannot_read_another_scouts_card_photos():
    assert Storage("owner").upload("cards/t1/s2/s2_archery/card.png") == OK
    assert Storage("parent").download("cards/t1/s2/s2_archery/card.png") == DENIED
    assert Storage("scout1").download("cards/t1/s2/s2_archery/card.png") == DENIED


def test_leaders_cannot_use_another_troops_card_folder():
    assert Storage("leader").upload("cards/t2/s1/s1_archery/card.png") == DENIED


def test_card_files_must_be_images_or_pdfs_under_10_mb():
    leader = Storage("leader")
    assert leader.upload("cards/t1/s1/s1_archery/notes.txt", b"hello", "text/plain") == DENIED
    assert leader.upload("cards/t1/s1/s1_archery/page.html", b"<script>", "text/html") == DENIED
    assert leader.upload("cards/t1/s1/s1_archery/huge.png", b"\0" * (10 * 1024 * 1024 + 1)) == DENIED
    assert leader.upload("cards/t1/s1/s1_archery/big.jpg", b"\0" * (9 * 1024 * 1024), "image/jpeg") == OK
