"""The cover photo and logo follow the same Scout tagging and media-consent rule as gallery photos."""

from handlers.site import validate_draft
from handlers.site_build import build_public_site, draft_files, filter_branding

YES = {"granted": True, "byMemberId": "m-parent"}
MEMBERS = {
    "s1": {"kind": "scout", "displayName": "Sam Smith", "mediaConsent": YES},
    "s2": {"kind": "scout", "displayName": "Riley", "mediaConsent": {"granted": False}},
    "s3": {"kind": "scout", "displayName": "Alex"},
}
NONE = {"scoutIds": [], "noScoutsShown": False}
NO_SCOUTS = {"scoutIds": [], "noScoutsShown": True}


def tags(*ids: str) -> dict:
    return {"scoutIds": list(ids), "noScoutsShown": False}


def branded(cover_tags=NONE, logo_tags=NONE, cover="c.jpg", logo="logo.png") -> dict:
    raw = {
        "slug": "troop-101",
        "theme": {"logoPath": f"sites/t1/draft/{logo}" if logo else None},
        "cover": {"heading": "Troop 101", "photoPath": f"sites/t1/draft/{cover}" if cover else None},
        "about": "About",
        "meeting": {"schedule": "Mondays", "place": "Hall"},
    }
    clean = validate_draft(raw, "t1")
    clean["cover"]["photoTags"] = cover_tags
    clean["theme"]["logoTags"] = logo_tags
    return clean


def test_consented_or_scout_free_cover_and_logo_are_kept():
    clean, left_out = filter_branding(branded(tags("s1"), NO_SCOUTS), MEMBERS)
    assert left_out == []
    assert clean["cover"]["photoPath"] and clean["theme"]["logoPath"]


def test_cover_and_logo_showing_a_scout_without_consent_are_left_out_with_reasons():
    clean, left_out = filter_branding(branded(tags("s1", "s2"), tags("s3")), MEMBERS)
    assert clean["cover"]["photoPath"] is None and clean["theme"]["logoPath"] is None
    assert [(x["kind"], x["caption"], x["reason"]) for x in left_out] == [
        ("cover", "Cover photo", "No media consent recorded for Riley."),
        ("logo", "Logo", "No media consent recorded for Alex."),
    ]


def test_untagged_cover_and_logo_are_left_out_with_a_prompt_to_tag_them():
    clean, left_out = filter_branding(branded(), MEMBERS)
    assert clean["cover"]["photoPath"] is None and clean["theme"]["logoPath"] is None
    assert "Tag the Scouts in this cover photo" in left_out[0]["reason"]
    assert "Tag the Scouts in this logo" in left_out[1]["reason"]


def test_a_scout_no_longer_on_the_roster_blocks_the_cover():
    _, left_out = filter_branding(branded(tags("s9"), NO_SCOUTS), MEMBERS)
    assert "no longer on the roster" in left_out[0]["reason"]


def test_missing_cover_or_logo_is_not_reported_and_the_input_is_not_changed():
    out, left_out = filter_branding(branded(cover=None, logo=None), MEMBERS)
    assert left_out == [] and out["cover"]["photoPath"] is None
    original = branded()
    filter_branding(original, MEMBERS)
    assert original["cover"]["photoPath"] == "sites/t1/draft/c.jpg"


def test_a_left_out_cover_is_not_copied_and_the_site_falls_back():
    clean, _ = filter_branding(branded(), MEMBERS)
    assert draft_files(clean, []) == []
    site = build_public_site(clean, "t1", {"name": "Troop 101"}, {}, [], [], [])
    assert site["cover"]["photoUrl"] is None and site["theme"]["logoUrl"] is None
    assert site["theme"]["color"] == clean["theme"]["color"]
