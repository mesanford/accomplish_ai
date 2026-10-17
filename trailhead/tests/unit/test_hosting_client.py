import pytest

from endpoints import hosting_client as h

BASE = "https://firebasehosting.googleapis.com/v1beta1/projects/p1/sites/troops/customDomains"


class FakeHttp:
    """Records calls and answers from a list of (status, body) in order."""

    def __init__(self, *answers):
        self.answers, self.calls = list(answers), []

    def __call__(self, method, url, body):
        self.calls.append((method, url, body))
        return self.answers.pop(0)


def test_mode_defaults_to_off_and_the_emulator_never_goes_live():
    assert h.domains_mode({}) == "off"
    assert h.domains_mode({"DOMAINS_MODE": "bogus"}) == "off"
    assert h.domains_mode({"DOMAINS_MODE": "log"}) == "log"
    assert h.domains_mode({"DOMAINS_MODE": "live"}) == "live"
    assert h.domains_mode({"FUNCTIONS_EMULATOR": "true", "DOMAINS_MODE": "live"}) == "log"
    assert h.domains_mode({"FUNCTIONS_EMULATOR": "true"}) == "log"


def test_the_client_matches_the_mode():
    assert h.hosting_client({}) is None
    assert isinstance(h.hosting_client({"DOMAINS_MODE": "log"}), h.FakeClient)
    assert h.hosting_client({"DOMAINS_MODE": "live", "GCLOUD_PROJECT": "p1"}) is None  # no troop site id
    env = {"DOMAINS_MODE": "live", "GCLOUD_PROJECT": "p1", "TRAILHEAD_TROOPS_SITE": "troops"}
    assert isinstance(h.hosting_client(env), h.LiveClient)


def test_create_posts_the_domain_and_a_redirect_target_for_www():
    http = FakeHttp((200, {"name": "operations/1"}), (200, {}))
    client = h.LiveClient("p1", "troops", http)
    client.create("troop101.org")
    client.create("www.troop101.org", "troop101.org")
    assert http.calls == [
        ("POST", f"{BASE}?customDomainId=troop101.org", {}),
        ("POST", f"{BASE}?customDomainId=www.troop101.org", {"redirectTarget": "troop101.org"}),
    ]


def test_create_again_after_a_conflict_that_is_ours_changes_nothing_and_a_removed_one_is_undeleted():
    ours = FakeHttp((409, {}), (200, {"name": "x"}))
    h.LiveClient("p1", "troops", ours).create("troop101.org")
    assert [c[0] for c in ours.calls] == ["POST", "GET"]
    removed = FakeHttp((409, {}), (200, {"deleteTime": "2026-10-01T00:00:00Z"}), (200, {}))
    h.LiveClient("p1", "troops", removed).create("troop101.org")
    assert removed.calls[-1][1] == f"{BASE}/troop101.org:undelete"


def test_a_conflict_with_nothing_to_find_is_reported_as_a_conflict():
    http = FakeHttp((409, {"error": {"message": "in use"}}), (404, {}))
    with pytest.raises(h.HostingError) as err:
        h.LiveClient("p1", "troops", http).create("troop101.org")
    assert err.value.conflict


def test_get_returns_the_resource_or_none_and_errors_raise():
    client = h.LiveClient("p1", "troops", FakeHttp((200, {"hostState": "HOST_ACTIVE"}), (404, {}), (500, {})))
    assert client.get("a.org") == {"hostState": "HOST_ACTIVE"}
    assert client.get("b.org") is None
    with pytest.raises(h.HostingError):
        client.get("c.org")


def test_delete_ignores_a_domain_that_is_already_gone_but_not_other_errors():
    http = FakeHttp((200, {}), (404, {}), (403, {}))
    client = h.LiveClient("p1", "troops", http)
    client.delete("a.org")
    client.delete("b.org")
    with pytest.raises(h.HostingError):
        client.delete("c.org")
    assert http.calls[0] == ("DELETE", f"{BASE}/a.org", None)


def test_the_fake_reports_progress_by_name():
    fake = h.FakeClient()
    from handlers.domains import map_status

    expected = {
        "troop.org": "waiting_dns",
        "troop-dns.org": "verifying",
        "troop-cert.org": "issuing_certificate",
        "troop-live.org": "live",
        "troop-conflict.org": "failed",
    }
    for host, status in expected.items():
        assert map_status(fake.get(host)) == status, host
