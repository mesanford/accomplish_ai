"""Storage rules for photos of troop gear: every member reads, nobody writes from a client (the function does)."""

import pytest

from .storage import Storage, reset_storage, storage_up

OK, DENIED = 200, 403
PHOTO = "gear/t1/tent4/photo.png"

pytestmark = pytest.mark.skipif(not storage_up(), reason="Storage emulator not running; use `firebase emulators:exec`")


@pytest.fixture(autouse=True)
def clean_bucket():
    reset_storage()
    yield


def test_every_member_of_the_troop_reads_a_gear_photo_and_a_stranger_does_not():
    assert Storage("owner").upload(PHOTO) == OK
    for uid in ("leader", "parent", "scout1", "counselor"):
        assert Storage(uid).download(PHOTO) == OK
    assert Storage("stranger").download(PHOTO) == DENIED
    assert Storage(None).download(PHOTO) == DENIED


def test_no_client_writes_or_deletes_a_gear_photo():
    assert Storage("owner").upload(PHOTO) == OK
    for uid in ("leader", "chair", "parent"):
        who = Storage(uid)
        assert who.upload("gear/t1/tent4/mine.png") == DENIED
        assert who.upload(PHOTO) == DENIED
        assert who.delete(PHOTO) == DENIED
