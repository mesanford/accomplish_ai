"""Custom pages, the document library, the calendar and link previews on the emulators: publish and take down."""

import io
import zipfile

import pytest
import requests

from tests.integration.test_site_flow import (  # noqa: F401  (`seeded` is an autouse fixture)
    FUNCTIONS,
    SOON,
    T,
    call,
    draft,
    owner,
    publish,
    pytestmark,
    seeded,
    wait_for,
)
from tests.rules.emulator import PROJECT, read
from tests.rules.storage import PNG, Storage, download_public

SLUG = "publicSites/troop-101-springfield"
RECORD = f"{T}/site/published"
PDF = b"%PDF-1.7\nhello"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def page(blocks, slug="new-families", title="New families") -> dict:
    return {"id": slug, "title": title, "slug": slug, "blocks": blocks}


def image_block(name: str, scout_ids=None, no_scouts=False) -> dict:
    return {
        "type": "image",
        "path": f"sites/t1/draft/{name}",
        "alt": name,
        "scoutIds": scout_ids or [],
        "noScoutsShown": no_scouts,
    }


def add_document(doc_id: str, visibility: str, name="gear.pdf", content_type="application/pdf", body=PDF, **extra):
    path = f"docs/t1/{doc_id}/{name}"
    assert Storage("leader").upload(path, body, content_type) == 200
    record = {
        "title": f"Doc {doc_id}",
        "category": "gear",
        "visibility": visibility,
        "fileName": name,
        "contentType": content_type,
        "size": len(body),
        "storagePath": path,
        "createdBy": "leader",
        **extra,
    }
    assert owner.set(f"{T}/documents/{doc_id}", record) == 200
    return path


def docx_with_author() -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document>Gear</w:document>")
        z.writestr("docProps/core.xml", "<cp:coreProperties><dc:creator>Pat Leader</dc:creator></cp:coreProperties>")
    return out.getvalue()


def test_pages_publish_in_order_with_safe_links():
    blocks = [
        {"type": "heading", "text": "Welcome"},
        {"type": "paragraph", "inline": [{"text": "Read the "}, {"text": "guide", "href": "https://example.com/g"}]},
        {"type": "list", "items": [{"inline": [{"text": "Tent"}]}, {"inline": [{"text": "Pack"}]}]},
    ]
    assert owner.set(f"{T}/site/draft", draft(pages=[page(blocks), page([], "eagles", "Eagle Scouts")])) == 200
    assert publish().status_code == 200
    pages = read(SLUG)["pages"]
    assert [p["slug"] for p in pages] == ["new-families", "eagles"]
    assert pages[0]["blocks"][1]["inline"][1] == {"text": "guide", "href": "https://example.com/g"}


def test_a_page_with_a_script_link_cannot_be_published():
    bad = {"type": "paragraph", "inline": [{"text": "Click", "href": "javascript:alert(1)"}]}
    owner.set(f"{T}/site/draft", draft(pages=[page([bad])]))
    r = publish()
    assert r.status_code == 400 and "must start with https://" in r.text
    assert read(SLUG) is None


def test_page_images_follow_consent_and_lose_their_metadata():
    blocks = [image_block("sam.png", ["s1"]), image_block("riley.png", ["s2"]), image_block("land.png", no_scouts=True)]
    owner.set(f"{T}/site/draft", draft(pages=[page(blocks)]))
    assert call("set_media_consent", "parent", {"troopId": "t1", "scoutId": "s1", "granted": True}).status_code == 200
    r = publish()
    assert r.status_code == 200, r.text
    left_out = [x for x in r.json()["result"]["leftOut"] if x["kind"] == "page"]
    assert [x["reason"] for x in left_out] == ["No media consent recorded for Riley Jones."]
    shown = read(SLUG)["pages"][0]["blocks"]
    assert [b["alt"] for b in shown] == ["sam.png", "land.png"]
    assert all(download_public(b["url"]).status_code == 200 for b in shown)
    assert "scoutIds" not in str(shown) and "sites/t1/draft" not in str(shown)


def test_withdrawing_consent_takes_a_page_image_down():
    owner.set(f"{T}/site/draft", draft(pages=[page([image_block("sam.png", ["s1"])])]))
    assert call("set_media_consent", "parent", {"troopId": "t1", "scoutId": "s1", "granted": True}).status_code == 200
    assert publish().status_code == 200
    url = read(SLUG)["pages"][0]["blocks"][0]["url"]
    assert download_public(url).status_code == 200
    r = call("set_media_consent", "parent", {"troopId": "t1", "scoutId": "s1", "granted": False})
    assert r.json()["result"]["photosRemoved"] >= 1
    assert read(SLUG)["pages"][0]["blocks"] == []
    assert download_public(url).status_code == 404


def test_public_documents_are_copied_and_private_ones_are_not():
    add_document("pub", "public")
    add_document("mem", "members")
    add_document("led", "leaders")
    r = publish()
    assert r.status_code == 200, r.text
    docs = read(SLUG)["documents"]
    assert [d["id"] for d in docs] == ["pub"]
    assert set(docs[0]) == {"id", "title", "category", "fileName", "contentType", "size", "url"}
    got = download_public(docs[0]["url"])
    assert got.status_code == 200 and got.content == PDF
    assert Storage(None).download("docs/t1/pub/gear.pdf") == 403  # the private original stays private
    assert [d["id"] for d in read(RECORD)["documents"]] == ["pub"]


def test_word_documents_lose_author_details_and_fake_files_are_left_out():
    add_document("word", "public", "slip.docx", DOCX, docx_with_author())
    add_document("fake", "public", "fake.pdf", "application/pdf", b"<html><script>alert(1)</script>")
    r = publish()
    assert r.status_code == 200, r.text
    assert [x["caption"] for x in r.json()["result"]["leftOut"] if x["kind"] == "document"] == ["Doc fake"]
    docs = read(SLUG)["documents"]
    assert [d["id"] for d in docs] == ["word"]
    body = download_public(docs[0]["url"]).content
    assert b"Pat Leader" not in zipfile.ZipFile(io.BytesIO(body)).read("docProps/core.xml")


def test_an_image_document_showing_a_scout_needs_consent():
    add_document("untagged", "public", "flyer.png", "image/png", PNG)
    add_document("scene", "public", "scene.png", "image/png", PNG, noScoutsShown=True)
    r = publish()
    assert [d["id"] for d in read(SLUG)["documents"]] == ["scene"]
    assert any(x["kind"] == "document" and "Tag the Scouts" in x["reason"] for x in r.json()["result"]["leftOut"])


def test_making_a_document_private_or_deleting_it_takes_it_off_the_live_site():
    add_document("one", "public")
    add_document("two", "public", "two.pdf")
    assert publish().status_code == 200
    urls = {d["id"]: d["url"] for d in read(SLUG)["documents"]}
    assert set(urls) == {"one", "two"}
    owner.set(f"{T}/documents/one", {**read(f"{T}/documents/one"), "visibility": "members"})
    wait_for(lambda: [d["id"] for d in read(SLUG)["documents"]] == ["two"])
    assert download_public(urls["one"]).status_code == 404
    assert download_public(urls["two"]).status_code == 200
    assert Storage("parent").download("docs/t1/one/gear.pdf") == 200  # still in the app for members
    owner.delete(f"{T}/documents/two")
    wait_for(lambda: read(SLUG)["documents"] == [])
    assert download_public(urls["two"]).status_code == 404
    wait_for(lambda: Storage("leader").download("docs/t1/two/two.pdf") == 404)


def test_unpublish_removes_public_documents_but_not_the_library():
    add_document("pub", "public")
    assert publish().status_code == 200
    url = read(SLUG)["documents"][0]["url"]
    assert call("unpublish_site", "leader", {"troopId": "t1"}).status_code == 200
    assert read(SLUG) is None and download_public(url).status_code == 404
    assert read(f"{T}/documents/pub")["visibility"] == "public"
    assert Storage("leader").download("docs/t1/pub/gear.pdf") == 200


def test_the_calendar_lists_public_events_and_follows_changes():
    owner.set(f"{T}/events/e1", {"title": "Campout", "start": SOON, "place": "Camp Lowden", "public": True})
    owner.set(f"{T}/events/e2", {"title": "Leaders only", "start": SOON, "public": False})
    assert publish().status_code == 200
    assert [e["title"] for e in read(SLUG)["calendar"]] == ["Campout"]
    owner.set(f"{T}/events/e3", {"title": "Hike", "start": SOON, "public": True})
    wait_for(lambda: len(read(SLUG)["calendar"]) == 2)
    assert len(read(SLUG)["events"]) == 2


def test_announcement_layout_and_expiry():
    owner.set(f"{T}/site/draft", draft(coverLayout="split", announcement={"text": "Fees due", "endDate": "2999-01-01"}))
    assert publish().status_code == 200
    site = read(SLUG)
    assert site["cover"]["layout"] == "split" and site["announcement"] == {"text": "Fees due", "endDate": "2999-01-01"}
    owner.set(f"{T}/site/draft", draft(announcement={"text": "Old news", "endDate": "2000-01-01"}))
    assert publish().status_code == 200
    assert read(SLUG)["announcement"] is None


def test_site_pages_are_limited_to_ten():
    pages = [page([], f"p{i}", f"Page {i}") for i in range(11)]
    owner.set(f"{T}/site/draft", draft(pages=pages))
    r = publish()
    assert r.status_code == 400 and "up to 10" in r.text


def test_link_previews_carry_the_troops_details():
    """Needs the Hosting emulator too, because the function reads the app's index.html from it."""
    try:
        requests.get("http://127.0.0.1:5000/index.html", timeout=2).raise_for_status()
    except requests.RequestException:
        pytest.skip("needs the Hosting emulator serving app/dist")
    owner.set(f"{T}/site/draft", draft(pages=[page([], "new-families", "New families")]))
    assert publish().status_code == 200
    base = f"{FUNCTIONS}/{PROJECT}/us-central1/site_shell"
    home = requests.get(f"{base}/s/troop-101-springfield", timeout=20)
    assert home.status_code == 200
    assert "<title>Troop 101 · Scouts BSA Troop 101</title>" in home.text
    assert 'property="og:title"' in home.text and "Forthright: advancement planning" not in home.text
    sub = requests.get(f"{base}/s/troop-101-springfield/new-families", timeout=20)
    assert "<title>New families · Troop 101" in sub.text
    missing = requests.get(f"{base}/s/no-such-troop", timeout=20)
    assert missing.status_code == 404 and "Troop 101" not in missing.text
