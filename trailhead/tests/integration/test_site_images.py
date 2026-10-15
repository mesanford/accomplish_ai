"""Public site images on the emulators: metadata stripped on publish, cover photo and logo follow the consent rule."""

import io

from PIL import Image

from tests.integration.test_site_flow import (  # noqa: F401  (`seeded` is an autouse fixture)
    T,
    call,
    draft,
    owner,
    publish,
    pytestmark,
    seeded,
)
from tests.rules.emulator import read
from tests.rules.storage import Storage, download_public

SLUG = "publicSites/troop-101-springfield"


def phone_photo(size=(3000, 1500)) -> bytes:
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"
    exif.get_ifd(0x8825).update({1: "N", 2: (38.0, 15.0, 0.0), 3: "W", 4: (85.0, 45.0, 0.0)})
    out = io.BytesIO()
    Image.new("RGB", size, (20, 120, 40)).save(out, "JPEG", exif=exif.tobytes(), xmp=b"<x:xmpmeta>home</x:xmpmeta>")
    return out.getvalue()


def test_published_images_have_no_metadata_and_are_not_oversized():
    original = phone_photo()
    assert b"Exif" in original
    assert Storage("owner").upload("sites/t1/draft/land.png", original, "image/jpeg") == 200
    assert publish().status_code == 200
    site = read(SLUG)
    body = download_public(site["cover"]["photoUrl"])
    assert body.status_code == 200 and body.headers["content-type"].startswith("image/jpeg")
    for marker in (b"Exif", b"PhoneMaker", b"xmpmeta", b"home"):
        assert marker not in body.content
    img = Image.open(io.BytesIO(body.content))
    assert len(img.getexif()) == 0 and max(img.size) == 2400


def test_a_cover_photo_showing_an_unconsented_scout_is_left_out():
    owner.set(
        f"{T}/site/draft",
        draft(cover={"heading": "Troop 101", "photoPath": "sites/t1/draft/land.png", "photoScoutIds": ["s2"]}),
    )
    r = publish()
    assert r.status_code == 200, r.text
    left_out = r.json()["result"]["leftOut"]
    cover = [x for x in left_out if x["kind"] == "cover"]
    assert cover and cover[0]["reason"] == "No media consent recorded for Riley Jones."
    assert read(SLUG)["cover"]["photoUrl"] is None
    assert read(f"{T}/site/published")["cover"] is None


def test_an_untagged_logo_is_left_out_but_a_confirmed_one_is_published():
    owner.set(f"{T}/site/draft", draft(theme={"color": "#4f6a2e", "logoPath": "sites/t1/draft/logo.png"}))
    left_out = publish().json()["result"]["leftOut"]
    assert [x["kind"] for x in left_out if x["kind"] != "photo"] == ["logo"]
    assert read(SLUG)["theme"]["logoUrl"] is None
    assert Storage(None).download("sites/t1/public/logo.png") == 404
    owner.set(f"{T}/site/draft", draft())
    assert [x for x in publish().json()["result"]["leftOut"] if x["kind"] != "photo"] == []
    assert download_public(read(SLUG)["theme"]["logoUrl"]).status_code == 200


def test_a_file_that_is_not_an_image_cannot_be_published():
    assert Storage("owner").upload("sites/t1/draft/land.png", b"not really an image", "image/png") == 200
    r = publish()
    assert r.status_code == 400 and "can't be read" in r.text
    assert read(SLUG) is None


def test_withdrawing_consent_takes_down_a_published_cover_and_logo():
    owner.set(
        f"{T}/site/draft",
        draft(
            cover={"heading": "Troop 101", "photoPath": "sites/t1/draft/land.png", "photoScoutIds": ["s1"]},
            theme={"color": "#4f6a2e", "logoPath": "sites/t1/draft/logo.png", "logoScoutIds": ["s1"]},
            gallery=[],
        ),
    )
    consent = {"troopId": "t1", "scoutId": "s1", "granted": True}
    assert call("set_media_consent", "parent", consent).status_code == 200
    assert publish().json()["result"]["leftOut"] == []
    site = read(SLUG)
    assert download_public(site["cover"]["photoUrl"]).status_code == 200
    assert download_public(site["theme"]["logoUrl"]).status_code == 200
    assert read(f"{T}/site/published")["cover"]["scoutIds"] == ["s1"]

    r = call("set_media_consent", "parent", {**consent, "granted": False})
    assert r.json()["result"]["photosRemoved"] == 2
    site = read(SLUG)
    assert site["cover"]["photoUrl"] is None and site["theme"]["logoUrl"] is None
    assert site["cover"]["heading"] == "Troop 101"
    assert Storage(None).download("sites/t1/public/land.png") == 404
    assert Storage(None).download("sites/t1/public/logo.png") == 404


def test_withdrawal_for_another_scout_leaves_the_cover_alone():
    owner.set(
        f"{T}/site/draft",
        draft(cover={"heading": "Troop 101", "photoPath": "sites/t1/draft/land.png", "photoScoutIds": ["s1"]}),
    )
    assert call("set_media_consent", "parent", {"troopId": "t1", "scoutId": "s1", "granted": True}).status_code == 200
    assert publish().status_code == 200
    assert call("set_media_consent", "leader", {"troopId": "t1", "scoutId": "s2", "granted": False}).status_code == 200
    assert read(SLUG)["cover"]["photoUrl"] is not None
