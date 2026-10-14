import pytest

from handlers.site import DEFAULT_COLOR, MAX_GALLERY, InvalidSite, check_slug, validate_draft

T = "t1"


def draft(**overrides) -> dict:
    base = {
        "slug": "troop-101-springfield",
        "theme": {"color": "#4F6A2E", "logoPath": f"sites/{T}/draft/logo.png"},
        "cover": {"heading": "Troop 101", "tagline": "Adventure starts here", "photoPath": None},
        "about": "We camp every month.\n\nScouts lead.",
        "meeting": {"schedule": "Mondays, 7:00–8:30 pm", "place": "St. Mark's Hall", "address": ""},
        "faq": [{"q": "What does it cost?", "a": "$60 a year."}, {"q": " ", "a": ""}],
        "contacts": [{"memberId": "m-leader", "role": "Scoutmaster", "email": " sm@example.com "}],
        "gallery": [{"path": f"sites/{T}/draft/a.jpg", "caption": "Campout", "scoutIds": ["s1", "s1"]}],
        "recruiting": {"open": True, "intro": "We'd love to meet you."},
    }
    return {**base, **overrides}


@pytest.mark.parametrize("slug", ["troop-101", "abc", "t101-springfield-il", "a" * 40])
def test_valid_slugs(slug):
    assert check_slug(slug) == slug


@pytest.mark.parametrize(
    "slug", ["", None, "ab", "-troop", "troop-", "Troop-101", "troop_101", "troop 101", "a" * 41, "trööp"]
)
def test_invalid_slugs(slug):
    with pytest.raises(InvalidSite, match="web address|Web addresses"):
        check_slug(slug)


@pytest.mark.parametrize("slug", ["admin", "api", "join", "signin", "create", "www"])
def test_reserved_slugs(slug):
    with pytest.raises(InvalidSite, match="reserved"):
        check_slug(slug)


def test_clean_draft_trims_and_normalizes():
    clean = validate_draft(draft(), T)
    assert clean["theme"] == {"color": "#4f6a2e", "logoPath": f"sites/{T}/draft/logo.png"}
    assert clean["meeting"]["address"] is None
    assert clean["faq"] == [{"q": "What does it cost?", "a": "$60 a year."}]
    assert clean["contacts"] == [{"memberId": "m-leader", "role": "Scoutmaster", "email": "sm@example.com"}]
    assert clean["gallery"][0]["scoutIds"] == ["s1"]
    assert clean["gallery"][0]["noScoutsShown"] is False
    assert clean["recruiting"] == {"open": True, "intro": "We'd love to meet you."}


def test_missing_theme_uses_the_default_color():
    assert validate_draft(draft(theme=None), T)["theme"] == {"color": DEFAULT_COLOR, "logoPath": None}


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"cover": {"heading": "  "}}, "cover heading"),
        ({"about": ""}, "About us"),
        ({"meeting": {"schedule": "Mondays"}}, "meeting place"),
        ({"meeting": {"place": "Hall"}}, "meeting schedule"),
        ({"about": "x" * 4001}, "4,000 characters"),
        ({"theme": {"color": "green"}}, "theme color"),
        ({"faq": [{"q": "Cost?", "a": ""}]}, "needs an answer"),
        ({"contacts": [{"memberId": "m1", "role": ""}]}, "role is required"),
        ({"contacts": [{"memberId": "m1", "role": "SM", "email": "not-an-email"}]}, "email address"),
        ({"contacts": [{"role": "SM"}]}, "Choose a leader"),
        ({"gallery": [{"path": "x.jpg"}] * (MAX_GALLERY + 1)}, "up to 24 photos"),
        ({"contacts": [{"memberId": "m", "role": "SM"}] * 7}, "up to 6 contacts"),
    ],
)
def test_invalid_drafts(overrides, message):
    with pytest.raises(InvalidSite, match=message):
        validate_draft(draft(**overrides), T)


@pytest.mark.parametrize(
    "path",
    ["sites/t2/draft/a.jpg", "sites/t1/public/a.jpg", "sites/t1/draft/../../t2/draft/a.jpg", "sites/t1/draft/", 42],
)
def test_images_must_come_from_this_troops_drafts(path):
    with pytest.raises(InvalidSite, match="Upload it again"):
        validate_draft(draft(cover={"heading": "H", "photoPath": path}), T)


def test_no_draft_and_gallery_rows_without_a_file():
    with pytest.raises(InvalidSite, match="Save your website draft"):
        validate_draft(None, T)
    clean = validate_draft(draft(gallery=[{"path": None, "caption": "Unfinished upload"}, "junk"]), T)
    assert clean["gallery"] == []
