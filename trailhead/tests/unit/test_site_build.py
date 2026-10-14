from datetime import date

import pytest

from handlers.site import InvalidSite, validate_draft
from handlers.site_about import build_prompt, clean_about, fake_about, scrub_names, validate_notes
from handlers.site_build import (
    MAX_EVENTS,
    build_public_site,
    download_url,
    draft_files,
    filter_gallery,
    map_url,
    public_events,
    public_path,
    resolve_contacts,
)

TODAY = date(2026, 10, 14)
YES = {"granted": True, "byMemberId": "m-parent"}
MEMBERS = {
    "m-leader": {"kind": "adult", "displayName": "Pat Leader"},
    "s1": {"kind": "scout", "displayName": "Sam Smith", "mediaConsent": YES},
    "s2": {"kind": "scout", "displayName": "Riley", "mediaConsent": {"granted": False}},
    "s3": {"kind": "scout", "displayName": "Alex"},
}


def photo(name: str, scout_ids: list[str], no_scouts: bool = False) -> dict:
    return {"path": f"sites/t1/draft/{name}", "caption": name, "scoutIds": scout_ids, "noScoutsShown": no_scouts}


def test_gallery_keeps_only_consented_or_scout_free_photos():
    gallery = [
        photo("ok.jpg", ["s1"]),
        photo("refused.jpg", ["s1", "s2"]),
        photo("unrecorded.jpg", ["s3"]),
        photo("untagged.jpg", []),
        photo("landscape.jpg", [], no_scouts=True),
        photo("gone.jpg", ["s9"]),
    ]
    kept, left_out = filter_gallery(gallery, MEMBERS)
    assert [k["caption"] for k in kept] == ["ok.jpg", "landscape.jpg"]
    reasons = {item["caption"]: item["reason"] for item in left_out}
    assert reasons["refused.jpg"] == "No media consent recorded for Riley."
    assert reasons["unrecorded.jpg"] == "No media consent recorded for Alex."
    assert "Tag the Scouts" in reasons["untagged.jpg"]
    assert "no longer on the roster" in reasons["gone.jpg"]


def test_contacts_are_adults_with_names():
    contacts = [{"memberId": "m-leader", "role": "Scoutmaster", "email": None}]
    assert resolve_contacts(contacts, MEMBERS) == [{"name": "Pat Leader", "role": "Scoutmaster", "email": None}]
    with pytest.raises(InvalidSite, match="Only adult leaders"):
        resolve_contacts([{"memberId": "s1", "role": "Patrol leader", "email": None}], MEMBERS)
    with pytest.raises(InvalidSite, match="no longer on the roster"):
        resolve_contacts([{"memberId": "m-gone", "role": "SM", "email": None}], MEMBERS)


def test_public_events_are_upcoming_public_and_soonest_first():
    events = [
        {"title": "Campout", "start": "2026-11-06", "public": True, "place": " Camp Lowden "},
        {"title": "Court of Honor", "start": "2026-10-20", "public": True},
        {"title": "Leaders meeting", "start": "2026-10-21", "public": False},
        {"title": "Old hike", "start": "2026-09-01", "public": True},
        {"title": "Today", "start": "2026-10-14", "public": True, "place": ""},
        {"title": "No date", "public": True},
    ]
    out = public_events(events, TODAY)
    assert out == [
        {"title": "Today", "start": "2026-10-14", "place": None},
        {"title": "Court of Honor", "start": "2026-10-20", "place": None},
        {"title": "Campout", "start": "2026-11-06", "place": "Camp Lowden"},
    ]
    many = [{"title": f"E{i}", "start": f"2026-12-{i + 1:02d}", "public": True} for i in range(20)]
    assert len(public_events(many, TODAY)) == MAX_EVENTS


def test_urls_and_paths():
    assert public_path("t1", "sites/t1/draft/a b.jpg") == "sites/t1/public/a b.jpg"
    assert (
        download_url("b.appspot.com", "sites/t1/public/a b.jpg")
        == "https://firebasestorage.googleapis.com/v0/b/b.appspot.com/o/sites%2Ft1%2Fpublic%2Fa%20b.jpg?alt=media"
    )
    assert map_url(None) is None
    assert (
        map_url("1 Main St, Springfield") == "https://www.google.com/maps/search/?api=1&query=1+Main+St%2C+Springfield"
    )


def test_build_public_site_has_no_scout_details():
    raw = {
        "slug": "troop-101",
        "theme": {"color": "#123456", "logoPath": "sites/t1/draft/logo.png"},
        "cover": {"heading": "Troop 101", "photoPath": "sites/t1/draft/ok.jpg"},
        "about": "About",
        "meeting": {"schedule": "Mondays", "place": "Hall", "address": "1 Main St"},
        "contacts": [{"memberId": "m-leader", "role": "Scoutmaster"}],
        "gallery": [photo("ok.jpg", ["s1"])],
    }
    clean = validate_draft(raw, "t1")
    kept, _ = filter_gallery(clean["gallery"], MEMBERS)
    files = draft_files(clean, kept)
    assert files == ["sites/t1/draft/logo.png", "sites/t1/draft/ok.jpg"]
    urls = {p: f"https://x/{p}" for p in files}
    troop = {"name": "Troop 101", "unitNumber": "101", "council": "Lincoln Heritage"}
    contacts = resolve_contacts(clean["contacts"], MEMBERS)
    site = build_public_site(clean, "t1", troop, urls, contacts, kept, [])
    assert site["theme"]["logoUrl"] == "https://x/sites/t1/draft/logo.png"
    assert site["cover"]["photoUrl"] == "https://x/sites/t1/draft/ok.jpg"
    assert site["gallery"] == [{"url": "https://x/sites/t1/draft/ok.jpg", "caption": "ok.jpg"}]
    assert site["meeting"]["mapUrl"].startswith("https://www.google.com/maps/")
    assert site["recruiting"] == {"open": False, "intro": ""}
    text = repr(site)
    assert "s1" not in text and "Sam" not in text and "scoutIds" not in text


def test_about_helper_scrubs_scout_names_and_cleans_output():
    notes = validate_notes("  Sam Smith and RILEY earned Eagle. Samuel helps. We camp monthly.  ")
    scrubbed = scrub_names(notes, ["Sam Smith", "Riley"])
    assert scrubbed == "a Scout and a Scout earned Eagle. Samuel helps. We camp monthly."
    with pytest.raises(ValueError, match="notes"):
        validate_notes("   ")
    with pytest.raises(ValueError, match="1,500"):
        validate_notes("x" * 1501)
    prompt = build_prompt({"name": "Troop 101", "unitNumber": "101"}, scrubbed)
    assert "Troop 101" in prompt and "Council: not given" in prompt and "Sam " not in prompt
    assert clean_about("# About\n\nLine one\nline two\n\n\n- Para two") == "About\n\nLine one line two\n\nPara two"
    assert clean_about(None) == ""
    fake = fake_about({"name": "Troop 101", "unitNumber": "101", "council": "Lincoln Heritage Council"}, scrubbed)
    assert fake.count("\n\n") == 2 and "Lincoln Heritage Council" in fake
