from pathlib import Path

from handlers.site_meta import clean_host, describe, has_page, inject_meta, meta_tags, page_title, parse_path

SHELL = (Path(__file__).parents[2] / "app" / "index.html").read_text()
SITE = {
    "troopName": 'Troop 101 "Eagles"',
    "unitNumber": "101",
    "cover": {"tagline": "Camping <b>and</b> service", "photoUrl": "https://files.example.com/cover.jpg"},
    "about": "We camp.",
    "theme": {"logoUrl": "https://files.example.com/logo.png"},
    "pages": [{"slug": "new-families", "title": "New families"}],
}


def test_paths_are_parsed():
    assert parse_path("/s/Troop-101") == ("troop-101", None)
    assert parse_path("/s/troop-101/new-families/") == ("troop-101", "new-families")
    for bad in ("/", "/s", "/t/x", "/s/a/b/c", "/privacy"):
        assert parse_path(bad) is None


def test_the_shell_gets_the_troops_title_description_and_image():
    html = inject_meta(SHELL, meta_tags(SITE, "troop-101", None, "forthrightapp.com"))
    assert (
        html.count("<title>") == 1
        and "Troop 101 &quot;Eagles&quot; · Scouts BSA Troop 101" in html.split("</title>")[0]
    )
    assert html.count('property="og:title"') == 1 and html.count('name="description"') == 1
    assert "Forthright: advancement planning" not in html
    assert 'og:image" content="https://files.example.com/cover.jpg"' in html
    assert 'property="og:url" content="https://forthrightapp.com/s/troop-101"' in html
    assert html.count('<link rel="canonical"') == 1 and "https://forthrightapp.com/og-image.png" not in html
    assert 'id="root"' in html and "/src/main.tsx" in html  # the app still loads


def test_text_in_tags_is_escaped():
    html = inject_meta(SHELL, meta_tags(SITE, "troop-101", None, None))
    assert "<b>and</b>" not in html and "Camping &lt;b&gt;and&lt;/b&gt; service" in html
    assert '<meta property="og:url"' not in html and '<link rel="canonical"' not in html


def test_unsafe_image_urls_and_hosts_are_ignored():
    site = {**SITE, "cover": {"photoUrl": "javascript:alert(1)"}, "theme": {}}
    assert "og:image" not in meta_tags(site, "x", None, None) and "summary_large_image" not in meta_tags(
        site, "x", None, None
    )
    assert clean_host("evil.com/path") is None and clean_host('a"><script>') is None
    assert clean_host("forthrightapp.com") == "forthrightapp.com" and clean_host("127.0.0.1:5000") == "127.0.0.1:5000"


def test_page_titles_and_known_pages():
    assert page_title(SITE, "new-families").startswith("New families · ")
    assert page_title(SITE, "calendar").startswith("Calendar · ")
    assert has_page(SITE, None) and has_page(SITE, "calendar") and has_page(SITE, "new-families")
    assert not has_page(SITE, "nope") and not has_page(SITE, "calendar.ics")


def test_description_falls_back():
    assert describe({"cover": {}, "about": "First line.\n\nSecond.", "unitNumber": "9"}) == "First line."
    assert describe({"cover": {}, "about": "", "unitNumber": "9"}) == "Scouts BSA Troop 9."
    assert len(describe({"cover": {"tagline": "x" * 400}})) == 160
