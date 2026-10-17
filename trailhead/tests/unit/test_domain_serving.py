from handlers import domain_serving as s
from handlers.site_meta import inject_meta, meta_tags

DOMAINS = {
    "troop101.org": {"troopId": "t1", "slug": "troop-101", "status": "live"},
    "www.troop101.org": {"troopId": "t1", "slug": "troop-101", "status": "live", "redirectTo": "troop101.org"},
    "failed.org": {"troopId": "t2", "slug": "troop-202", "status": "failed"},
    "leaving.org": {"troopId": "t3", "slug": "troop-303", "status": "live", "pendingRemoval": True},
    "down.org": {"troopId": "t4", "slug": "gone", "status": "live"},
}
SITES = {
    "troop-101": {"troopName": "Troop 101", "unitNumber": "101", "pages": [{"slug": "new-families", "title": "New"}]},
    "troop-202": {"troopName": "Troop 202", "unitNumber": "202"},
    "troop-303": {"troopName": "Troop 303", "unitNumber": "303"},
}


def go(host, path="/"):
    return s.resolve(host, path, DOMAINS.get, SITES.get)


def test_host_comes_from_the_forwarded_header_without_port_or_case():
    assert s.request_host("Troop101.ORG:443", "x.cloudfunctions.net") == "troop101.org"
    assert s.request_host(None, "troop101.org.") == "troop101.org"
    assert s.request_host("troop101.org, other.example", None) == "troop101.org"
    assert s.request_host("bad host", None) is None
    assert s.request_host(None, None) is None


def test_forthrights_own_addresses_are_not_troop_domains():
    for host in (
        "forthrightapp.com",
        "www.forthrightapp.com",
        "scout-app-prod-d6a66.web.app",
        "x.firebaseapp.com",
        None,
    ):
        assert s.is_app_host(host)
    assert s.is_app_host("preview.example", ("preview.example",))
    assert not s.is_app_host("troop101.org")
    assert not s.is_app_host("notforthrightapp.com")


def test_the_home_page_and_pages_are_served_from_the_hosts_troop():
    home = go("troop101.org")
    assert (home.slug, home.page, home.site["troopName"]) == ("troop-101", None, "Troop 101")
    assert go("troop101.org", "/new-families").page == "new-families"
    assert go("troop101.org", "/Calendar/").page == "calendar"


def test_unknown_hosts_and_unusable_domains_are_not_set_up():
    for host in ("nobody.org", "failed.org", "leaving.org", "down.org"):
        assert go(host) == s.Refused("unknown")


def test_missing_pages_and_files_are_refused_differently():
    assert go("troop101.org", "/nope") == s.Refused("page", "troop-101")
    assert go("troop101.org", "/a/b") == s.Refused("page", "troop-101")
    assert go("troop101.org", "/favicon.ico") == s.Refused("asset", "troop-101")
    assert go("troop101.org", "/s/troop-101") == s.Refused("page", "troop-101")


def test_the_www_twin_redirects():
    assert go("www.troop101.org") == s.Redirect("troop101.org")


def test_a_troop_domain_page_uses_its_own_address_in_the_head():
    site = SITES["troop-101"]
    shell = '<html><head><title>Forthright</title></head><body><div id="root"></div></body></html>'
    html = inject_meta(shell, meta_tags(site, "troop-101", None, "troop101.org", custom=True))
    assert '<link rel="canonical" href="https://troop101.org/" />' in html
    assert 'property="og:url" content="https://troop101.org/"' in html
    assert '<meta name="forthright-site" content="troop-101" />' in html
    page = meta_tags(site, "troop-101", "new-families", "troop101.org", custom=True)
    assert 'href="https://troop101.org/new-families"' in page
    assert "/s/troop-101" not in page


def test_forthright_addresses_keep_their_old_tags_and_no_marker():
    tags = meta_tags(SITES["troop-101"], "troop-101", None, "forthrightapp.com")
    assert "https://forthrightapp.com/s/troop-101" in tags and "forthright-site" not in tags
