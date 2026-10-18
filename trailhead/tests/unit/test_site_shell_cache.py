"""site_shell's copy of the app's index.html follows deploys within seconds, so troop sites never name a gone script."""

import io
import urllib.error

import pytest

from endpoints import site_shell

OLD = '<html><div id="root"></div><script src="/assets/index-OLD.js"></script></html>'
NEW = '<html><div id="root"></div><script src="/assets/index-NEW.js"></script></html>'


class Hosting:
    """A fake Hosting: serves `page` with `etag`, answers 304 when the copy is current, or fails when `down`."""

    def __init__(self, page: str, etag: str):
        self.page, self.etag, self.down, self.calls = page, etag, False, []

    def __call__(self, request, timeout):
        sent = request.get_header("If-none-match")
        self.calls.append(sent)
        if self.down:
            raise urllib.error.URLError("unreachable")
        if sent == self.etag:
            raise urllib.error.HTTPError(request.full_url, 304, "Not Modified", {}, None)
        response = io.BytesIO(self.page.encode())
        response.headers = {"ETag": self.etag}
        return response


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    monkeypatch.setattr(site_shell, "_shell", {"html": None, "etag": None, "checked": 0.0})
    monkeypatch.setattr(site_shell, "app_origin", lambda: "https://example.test")


def test_reuses_the_copy_briefly_then_checks_it_cheaply():
    hosting = Hosting(OLD, '"v1"')
    assert site_shell.load_shell(now=100, opener=hosting) == OLD
    assert site_shell.load_shell(now=105, opener=hosting) == OLD  # within CHECK_SECONDS: no request
    assert hosting.calls == [None]
    assert site_shell.load_shell(now=111, opener=hosting) == OLD  # checked: unchanged (304)
    assert hosting.calls == [None, '"v1"']


def test_a_deploy_replaces_the_copy_at_the_next_check():
    hosting = Hosting(OLD, '"v1"')
    site_shell.load_shell(now=100, opener=hosting)
    hosting.page, hosting.etag = NEW, '"v2"'
    assert site_shell.load_shell(now=105, opener=hosting) == OLD
    assert site_shell.load_shell(now=111, opener=hosting) == NEW


def test_keeps_the_last_good_copy_when_hosting_is_down_or_odd():
    hosting = Hosting(OLD, '"v1"')
    site_shell.load_shell(now=100, opener=hosting)
    hosting.down = True
    assert site_shell.load_shell(now=111, opener=hosting) == OLD
    assert site_shell.load_shell(now=115, opener=hosting) == OLD  # waits an interval before trying again
    assert len(hosting.calls) == 2
    hosting.down, hosting.page, hosting.etag = False, "<html>maintenance</html>", '"v3"'
    assert site_shell.load_shell(now=125, opener=hosting) == OLD  # not the app's page: ignored


def test_nothing_to_serve_until_the_first_fetch_works():
    hosting = Hosting(OLD, '"v1"')
    hosting.down = True
    assert site_shell.load_shell(now=100, opener=hosting) is None
