"""Firestore rules for the document library: troops/{t}/documents/{id}."""

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
PDF = "application/pdf"


def doc(visibility="members", doc_id="d1", **overrides) -> dict:
    base = {
        "title": "Gear list",
        "category": "gear",
        "visibility": visibility,
        "fileName": "gear.pdf",
        "contentType": PDF,
        "size": 12_000,
        "storagePath": f"docs/t1/{doc_id}/gear.pdf",
        "createdBy": "leader",
    }
    return {**base, **overrides}


def path(doc_id="d1") -> str:
    return f"{T}/documents/{doc_id}"


def seed(visibility: str, doc_id: str = "d1", **overrides) -> None:
    assert Client("owner").set(path(doc_id), doc(visibility, doc_id, **overrides)) == OK


def test_every_kind_of_leader_can_add_and_change_documents():
    for uid in ("leader", "assistant", "chair"):
        assert Client(uid).set(path(uid), doc(doc_id=uid, createdBy=uid)) == OK
    assert Client("leader").set(path("leader"), doc(doc_id="leader", title="Renamed", visibility="public")) == OK
    assert Client("leader").delete(path("leader")) == OK


def test_members_who_are_not_leaders_cannot_write_documents():
    for uid in ("parent", "scout1", "counselor", "stranger", None):
        assert Client(uid).set(path(), doc(createdBy=uid or "x")) == DENIED
    seed("members")
    for uid in ("parent", "scout1", "counselor", "stranger", None):
        assert Client(uid).set(path(), doc(title="Mine")) == DENIED
        assert Client(uid).delete(path()) == DENIED


def test_visibility_decides_who_reads_a_document():
    seed("leaders", "private")
    seed("members", "members")
    seed("public", "public")
    for uid in ("leader", "assistant", "chair"):
        for d in ("private", "members", "public"):
            assert Client(uid).get(path(d)) == OK
    for uid in ("parent", "scout1", "counselor"):
        assert Client(uid).get(path("private")) == DENIED
        assert Client(uid).get(path("members")) == OK
        assert Client(uid).get(path("public")) == OK
    # People outside the troop and signed-out visitors read nothing here; public files are read from the site.
    for uid in ("stranger", None):
        for d in ("private", "members", "public"):
            assert Client(uid).get(path(d)) == DENIED


def test_a_document_cannot_be_public_when_it_is_a_medical_form():
    leader = Client("leader")
    assert leader.set(path(), doc("public", category="medical")) == DENIED
    assert leader.set(path(), doc("members", category="medical")) == OK
    assert leader.set(path(), doc("leaders", category="medical")) == OK
    assert leader.set(path(), doc("public", category="medical")) == DENIED  # also when changing an existing one


def test_old_word_files_cannot_be_public():
    old_word = {"contentType": "application/msword", "fileName": "form.doc", "storagePath": "docs/t1/d1/form.doc"}
    assert Client("leader").set(path(), doc("public", **old_word)) == DENIED
    assert Client("leader").set(path(), doc("members", **old_word)) == OK


def test_the_shape_of_a_document_is_checked():
    leader = Client("leader")
    assert leader.set(path(), doc(title="")) == DENIED
    assert leader.set(path(), doc(title="x" * 121)) == DENIED
    assert leader.set(path(), doc(visibility="everyone")) == DENIED
    assert leader.set(path(), doc(category="secret")) == DENIED
    assert leader.set(path(), doc(contentType="text/html")) == DENIED
    assert leader.set(path(), doc(size=20 * 1024 * 1024 + 1)) == DENIED
    assert leader.set(path(), doc(size=0)) == DENIED
    assert leader.set(path(), {**doc(), "extra": 1}) == DENIED
    assert leader.set(path(), doc(storagePath="docs/t2/d1/gear.pdf")) == DENIED  # another troop's folder
    assert leader.set(path(), doc(storagePath="docs/t1/other/gear.pdf")) == DENIED  # another document's folder
    assert leader.set(path(), doc(storagePath="docs/t1/d1/a/b.pdf")) == DENIED
    assert leader.set(path(), doc(createdBy="someone-else")) == DENIED
    assert leader.set(path(), doc(scoutIds=["s1"], noScoutsShown=False)) == OK


def test_a_document_cannot_be_pointed_at_another_file_after_upload():
    seed("members")
    leader = Client("leader")
    assert leader.set(path(), doc("leaders", title="New title")) == OK
    assert leader.set(path(), doc("leaders", storagePath="docs/t1/d1/other.pdf")) == DENIED
    assert leader.set(path(), doc("leaders", contentType="image/png")) == DENIED
    assert leader.set(path(), doc("leaders", size=5)) == DENIED
    assert leader.set(path(), doc("leaders", createdBy="assistant")) == DENIED


def test_another_troops_leaders_have_no_access():
    seed("members")
    assert (
        Client("owner").set("troops/t2/access/leader2", {"memberId": "m-l2", "roles": ["leader"], "scoutIds": []}) == OK
    )
    assert Client("leader2").get(path()) == DENIED
    assert Client("leader2").set(path("d9"), doc(doc_id="d9", createdBy="leader2")) == DENIED
    assert Client("leader2").delete(path()) == DENIED
