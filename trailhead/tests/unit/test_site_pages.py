from datetime import date

import pytest

from handlers.site import InvalidSite, validate_draft
from handlers.site_build import (
    MAX_CALENDAR,
    MAX_EVENTS,
    build_public_site,
    draft_files,
    filter_pages,
    live_announcement,
    public_events,
    site_urls,
)
from handlers.site_pages import (
    MAX_BLOCKS,
    MAX_PAGES,
    check_page_slug,
    drop_image_urls,
    page_image_records,
    public_pages,
    safe_href,
    validate_pages,
)
from tests.unit.test_site import draft

T = "t1"
YES = {"granted": True}
MEMBERS = {
    "s1": {"kind": "scout", "displayName": "Sam", "mediaConsent": YES},
    "s2": {"kind": "scout", "displayName": "Al"},
}


def page(slug="high-adventure", title="High adventure", blocks=None, **extra) -> dict:
    return {"id": slug, "title": title, "slug": slug, "blocks": blocks if blocks is not None else [], **extra}


def image(name="a.jpg", scout_ids=None, no_scouts=False, alt="Lake") -> dict:
    return {
        "type": "image",
        "path": f"sites/{T}/draft/{name}",
        "alt": alt,
        "scoutIds": scout_ids or [],
        "noScoutsShown": no_scouts,
    }


@pytest.mark.parametrize(
    "href",
    ["https://example.com", "http://example.com/a?b=1#c", "mailto:sm@example.com", " https://example.com/x "],
)
def test_safe_links_are_kept(href):
    assert safe_href(href) == href.strip()


@pytest.mark.parametrize(
    "href",
    [
        "javascript:alert(1)",
        "JaVaScRiPt:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:x",
        "file:///etc/passwd",
        "ftp://example.com",
        "//example.com",
        "/relative",
        "example.com",
        "https://",
        "mailto:",
        "https://exa mple.com",
        "https://example.com/\nx",
        "java\tscript:alert(1)",
        "https://" + "a" * 600,
        "",
        None,
        5,
    ],
)
def test_unsafe_links_are_refused(href):
    assert safe_href(href) is None


def test_a_page_keeps_its_blocks_in_order_and_drops_empty_ones():
    blocks = [
        {"type": "heading", "text": "  Philmont  "},
        {"type": "paragraph", "inline": [{"text": "See "}, {"text": "the plan", "href": "https://example.com/p"}]},
        {"type": "paragraph", "inline": [{"text": ""}]},
        {"type": "list", "items": [{"inline": [{"text": "Boots"}]}, {"inline": []}, {"inline": [{"text": "Pack"}]}]},
        {"type": "heading", "text": "   "},
        image(),
    ]
    [clean] = validate_pages([page(blocks=blocks)], T)
    assert [b["type"] for b in clean["blocks"]] == ["heading", "paragraph", "list", "image"]
    assert clean["blocks"][0]["text"] == "Philmont"
    assert clean["blocks"][1]["inline"][1] == {"text": "the plan", "href": "https://example.com/p"}
    assert clean["blocks"][2]["items"] == [{"inline": [{"text": "Boots"}]}, {"inline": [{"text": "Pack"}]}]


def test_no_raw_html_survives_as_markup_and_unknown_keys_are_dropped():
    blocks = [
        {"type": "paragraph", "inline": [{"text": "<script>alert(1)</script>", "onclick": "x", "html": "<b>"}]},
        {"type": "heading", "text": "<img src=x onerror=alert(1)>", "html": "<i>"},
    ]
    [clean] = validate_pages([page(blocks=blocks, extra="x")], T)
    assert clean["blocks"][0]["inline"] == [{"text": "<script>alert(1)</script>"}]  # stays plain text
    assert set(clean["blocks"][0]) == {"type", "inline"} and set(clean) == {"id", "title", "slug", "blocks"}
    assert set(clean["blocks"][1]) == {"type", "text"}


@pytest.mark.parametrize("href", ["javascript:alert(1)", "data:text/html,x", "ftp://x.org", "/local"])
def test_a_page_with_an_unsafe_link_is_refused(href):
    block = {"type": "paragraph", "inline": [{"text": "Click", "href": href}]}
    with pytest.raises(InvalidSite, match="must start with https://"):
        validate_pages([page(blocks=[block])], T)
    with pytest.raises(InvalidSite, match="must start with https://"):
        validate_pages([page(blocks=[{"type": "list", "items": [{"inline": [{"text": "x", "href": href}]}]}])], T)


def test_page_images_must_be_troop_uploads():
    bad = {**image(), "path": "sites/other/draft/a.jpg"}
    with pytest.raises(InvalidSite, match="isn't in this troop's uploads"):
        validate_pages([page(blocks=[bad])], T)
    bad = {**image(), "path": f"sites/{T}/public/a.jpg"}
    with pytest.raises(InvalidSite):
        validate_pages([page(blocks=[bad])], T)


def test_page_limits_and_titles():
    with pytest.raises(InvalidSite, match=f"up to {MAX_PAGES}"):
        validate_pages([page(slug=f"p{i}", title=f"P{i}") for i in range(MAX_PAGES + 1)], T)
    assert len(validate_pages([page(slug=f"p{i}", title=f"P{i}") for i in range(MAX_PAGES)], T)) == MAX_PAGES
    with pytest.raises(InvalidSite, match="needs a title"):
        validate_pages([page(title="  ")], T)
    with pytest.raises(InvalidSite, match="60 characters"):
        validate_pages([page(title="x" * 61)], T)
    with pytest.raises(InvalidSite, match=f"up to {MAX_BLOCKS}"):
        validate_pages([page(blocks=[{"type": "heading", "text": "x"}] * (MAX_BLOCKS + 1))], T)
    with pytest.raises(InvalidSite, match="1,500"):
        validate_pages([page(blocks=[{"type": "paragraph", "inline": [{"text": "x" * 1501}]}])], T)
    with pytest.raises(InvalidSite, match="not a known kind"):
        validate_pages([page(blocks=[{"type": "script", "text": "x"}])], T)
    assert validate_pages(None, T) == [] and validate_pages("nope", T) == []


@pytest.mark.parametrize("slug", ["a", "high-adventure", "eagles-2026", "a" * 40])
def test_valid_page_slugs(slug):
    assert check_page_slug(slug) == slug


@pytest.mark.parametrize(
    "slug",
    [
        "",
        None,
        "-x",
        "x-",
        "X",
        "high adventure",
        "a.b",
        "a/b",
        "calendar",
        "documents",
        "home",
        "a" * 41,
        "calendar.ics",
    ],
)
def test_invalid_or_reserved_page_slugs(slug):
    with pytest.raises(InvalidSite):
        check_page_slug(slug)


def test_page_addresses_must_be_unique():
    with pytest.raises(InvalidSite, match="Two pages use the address"):
        validate_pages([page(), page(title="Again")], T)


def test_the_draft_check_includes_pages_announcement_and_layout():
    clean = validate_draft(
        draft(
            pages=[page(blocks=[{"type": "heading", "text": "Hi"}])],
            announcement={"text": " Camp fees due ", "endDate": "2026-11-01"},
            coverLayout="split",
        ),
        T,
    )
    assert clean["pages"][0]["slug"] == "high-adventure"
    assert clean["announcement"] == {"text": "Camp fees due", "endDate": "2026-11-01"}
    assert clean["coverLayout"] == "split"
    plain = validate_draft(draft(coverLayout="wild", announcement={"text": "  "}), T)
    assert plain["coverLayout"] == "band" and plain["announcement"] is None and plain["pages"] == []
    with pytest.raises(InvalidSite, match="end date"):
        validate_draft(draft(announcement={"text": "x", "endDate": "soon"}), T)
    with pytest.raises(InvalidSite, match="200 characters"):
        validate_draft(draft(announcement={"text": "x" * 201}), T)


def test_announcements_expire_after_their_end_date():
    today = date(2026, 10, 14)
    banner = {"text": "Fees due", "endDate": "2026-10-14"}
    assert live_announcement(banner, today) == banner
    assert live_announcement({**banner, "endDate": "2026-10-13"}, today) is None
    assert live_announcement({"text": "Always", "endDate": None}, today) == {"text": "Always", "endDate": None}
    assert live_announcement(None, today) is None


def test_page_images_follow_the_photo_consent_rule():
    pages = [
        page(
            blocks=[
                image("ok.jpg", ["s1"]),
                image("no-consent.jpg", ["s2"], alt="Al at camp"),
                image("untagged.jpg", []),
                image("landscape.jpg", no_scouts=True),
            ]
        )
    ]
    clean, left_out = filter_pages({"pages": pages}, MEMBERS)
    kept = [b["path"].rsplit("/", 1)[-1] for b in clean["pages"][0]["blocks"]]
    assert kept == ["ok.jpg", "landscape.jpg"]
    assert [x["kind"] for x in left_out] == ["page", "page"]
    assert left_out[0]["reason"] == "No media consent recorded for Al."
    assert left_out[0]["caption"] == 'Al at camp (page "High adventure")'


def test_page_images_are_published_and_recorded_for_takedown():
    pages = [page(blocks=[image("ok.jpg", ["s1"]), {"type": "heading", "text": "Hi"}])]
    path = f"sites/{T}/draft/ok.jpg"
    urls = {path: "https://files/ok.jpg"}
    assert draft_files({"theme": {"logoPath": None}, "cover": {"photoPath": None}, "pages": pages}, []) == [path]
    published = public_pages(pages, urls)
    assert published[0]["blocks"][0] == {"type": "image", "url": "https://files/ok.jpg", "alt": "Lake"}
    assert "path" not in str(published) and "scoutIds" not in str(published)
    assert page_image_records(pages, urls) == [
        {"url": "https://files/ok.jpg", "scoutIds": ["s1"], "noScoutsShown": False}
    ]
    assert public_pages(pages, {})[0]["blocks"] == [{"type": "heading", "text": "Hi"}]
    assert drop_image_urls(published, {"https://files/ok.jpg"})[0]["blocks"] == [{"type": "heading", "text": "Hi"}]
    assert site_urls({"pages": published, "documents": [{"url": "https://files/d.pdf"}]}) == {
        "https://files/ok.jpg",
        "https://files/d.pdf",
    }


def test_the_public_site_carries_pages_documents_calendar_and_layout():
    clean = validate_draft(draft(pages=[page(blocks=[{"type": "heading", "text": "Hi"}])], coverLayout="centered"), T)
    events = [{"title": f"E{i}", "start": f"2099-01-{i + 1:02d}", "place": None} for i in range(20)]
    docs = [{"id": "d1", "title": "Handbook", "url": "https://files/h.pdf"}]
    site = build_public_site(clean, T, {"name": "Troop 101"}, {}, [], [], events, docs)
    assert site["cover"]["layout"] == "centered"
    assert len(site["events"]) == MAX_EVENTS and len(site["calendar"]) == 20
    assert site["pages"][0]["slug"] == "high-adventure" and site["documents"] == docs
    assert site["announcement"] is None


def test_calendar_lists_more_events_than_the_home_page():
    events = [
        {"title": f"E{i}", "start": f"2099-{1 + i // 28:02d}-{1 + i % 28:02d}", "public": True} for i in range(80)
    ]
    assert len(public_events(events, date(2026, 1, 1))) == MAX_EVENTS
    assert len(public_events(events, date(2026, 1, 1), MAX_CALENDAR)) == MAX_CALENDAR
