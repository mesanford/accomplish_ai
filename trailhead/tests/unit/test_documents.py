import io
import zipfile

import pytest

from handlers.documents import (
    DOC,
    DOCX,
    MAX_BYTES,
    UnreadableDocument,
    can_be_public,
    is_public,
    prepare_public_copy,
    public_doc_path,
    public_listing,
    safe_file_name,
    sort_documents,
    strip_docx_properties,
    who_can_read,
)
from tests.rules.storage import PNG

LEADER, MEMBER = {"leader"}, {"parent"}


def doc(visibility="members", category="gear", content_type="application/pdf", **extra) -> dict:
    return {
        "title": "Gear list",
        "category": category,
        "visibility": visibility,
        "contentType": content_type,
        "fileName": "gear.pdf",
        "size": 1000,
        **extra,
    }


@pytest.mark.parametrize(
    ("visibility", "roles", "member", "allowed"),
    [
        ("public", set(), False, False),  # strangers read the public copy, never the private original
        ("public", MEMBER, True, True),
        ("members", MEMBER, True, True),
        ("members", set(), False, False),
        ("leaders", MEMBER, True, False),
        ("leaders", {"counselor"}, True, False),
        ("leaders", {"scout"}, True, False),
        ("leaders", LEADER, True, True),
        ("leaders", {"scoutmaster"}, True, True),
        ("leaders", {"advancement"}, True, True),
        ("members", {"advancement"}, True, True),
    ],
)
def test_who_can_read_a_document(visibility, roles, member, allowed):
    assert who_can_read(doc(visibility), roles, member) is allowed


def test_only_public_documents_go_on_the_site_and_medical_forms_never_do():
    assert is_public(doc("public"))
    assert not is_public(doc("members")) and not is_public(doc("leaders")) and not is_public(None)
    assert not is_public(doc("public", category="medical"))
    assert not can_be_public(doc("public", content_type=DOC))  # old .doc files can't have their details removed
    assert can_be_public(doc("public", content_type=DOCX)) and can_be_public(doc("public", content_type="image/png"))


def test_file_names_are_made_safe():
    assert safe_file_name("../../etc/passwd") == "passwd"
    assert safe_file_name("Permission slip (2026).pdf") == "Permission-slip-2026-.pdf"
    assert safe_file_name("a b/c\\d e.pdf") == "d-e.pdf"
    assert safe_file_name("???") == "document" and safe_file_name(None) == "document"
    assert len(safe_file_name("x" * 300)) == 80
    assert public_doc_path("t1", "abc", "My File.pdf") == "sites/t1/public/doc-abc-My-File.pdf"
    assert "/" not in public_doc_path("t1", "abc", "../x.pdf").removeprefix("sites/t1/public/")


def make_docx(author="Pat Leader") -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document>Gear list</w:document>")
        z.writestr("docProps/core.xml", f"<cp:coreProperties><dc:creator>{author}</dc:creator></cp:coreProperties>")
        z.writestr("docProps/app.xml", "<Properties><Company>St. Mark's</Company></Properties>")
    return out.getvalue()


def test_word_files_lose_their_author_details_but_keep_their_text():
    cleaned, content_type = prepare_public_copy(make_docx(), DOCX)
    assert content_type == DOCX
    z = zipfile.ZipFile(io.BytesIO(cleaned))
    assert b"Pat Leader" not in z.read("docProps/core.xml") and b"Mark" not in z.read("docProps/app.xml")
    assert b"Gear list" in z.read("word/document.xml")
    with pytest.raises(UnreadableDocument):
        strip_docx_properties(b"PK\x03\x04 not really a zip")


def test_a_file_must_be_what_its_type_says():
    assert prepare_public_copy(b"%PDF-1.7\n...", "application/pdf") == (b"%PDF-1.7\n...", "application/pdf")
    for data, kind in ((b"<html><script>x</script>", "application/pdf"), (b"%PDF-1.7", DOCX), (b"hello", DOCX)):
        with pytest.raises(UnreadableDocument):
            prepare_public_copy(data, kind)
    with pytest.raises(UnreadableDocument, match="can't go on the public site"):
        prepare_public_copy(b"\xd0\xcf\x11\xe0 old word", DOC)
    with pytest.raises(UnreadableDocument, match="20 MB"):
        prepare_public_copy(b"%PDF-" + b"0" * MAX_BYTES, "application/pdf")


def test_public_images_are_re_encoded_and_fake_images_refused():
    data, content_type = prepare_public_copy(PNG, "image/png")
    assert content_type == "image/png" and data.startswith(b"\x89PNG")
    with pytest.raises(UnreadableDocument):
        prepare_public_copy(b"not an image", "image/png")


def test_the_public_listing_hides_storage_details():
    listing = public_listing("d1", doc("public", storagePath="docs/t1/d1/gear.pdf", createdBy="uid1"), "https://f/d")
    assert listing == {
        "id": "d1",
        "title": "Gear list",
        "category": "gear",
        "fileName": "gear.pdf",
        "contentType": "application/pdf",
        "size": 1000,
        "url": "https://f/d",
    }


def test_documents_sort_by_category_then_title():
    docs = [
        ("1", doc(category="other", title="Zebra")),
        ("2", doc(category="gear", title="b list")),
        ("3", doc(category="permission", title="Camp")),
        ("4", doc(category="gear", title="A list")),
    ]
    assert [i for i, _ in sort_documents(docs)] == ["3", "4", "2", "1"]
