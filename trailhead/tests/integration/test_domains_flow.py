"""A troop's own domain on the emulators: add, check, remove, unpublish, and the 7-day timeout.

The Functions emulator never calls the live Hosting API: `DOMAINS_MODE` is treated as `log`, and a built-in fake
answers by the domain's name (`-dns`, `-cert`, `-live`, `-conflict` endings; anything else is waiting for DNS).
"""

import os
from datetime import UTC, datetime, timedelta

import pytest
import requests

from tests.rules.emulator import PROJECT, Client, list_docs, read, reset, token
from tests.rules.storage import reset_storage, storage_up

FUNCTIONS = os.environ.get("FUNCTIONS_EMULATOR_URL", "http://127.0.0.1:5001")
T = "troops/t1"
FUTURE = datetime.now(UTC) + timedelta(days=365)

pytestmark = pytest.mark.skipif(
    not os.environ.get("RUN_FUNCTIONS_TESTS") or not storage_up(),
    reason="needs the Firestore, Functions and Storage emulators (see README)",
)
owner = Client("owner")


def call(name: str, uid: str, data: dict) -> requests.Response:
    url = f"{FUNCTIONS}/{PROJECT}/us-central1/{name}"
    return requests.post(url, json={"data": data}, headers={"Authorization": f"Bearer {token(uid)}"}, timeout=60)


def add(domain: str, uid: str = "leader", troop: str = "t1", www: bool = False) -> requests.Response:
    return call("add_domain", uid, {"troopId": troop, "domain": domain, "www": www})


def error(r: requests.Response) -> str:
    return r.json()["error"]["message"]


@pytest.fixture(autouse=True)
def seeded():
    reset()
    reset_storage()
    owner.set(T, {"name": "Troop 101", "unitNumber": "101", "site": {"slug": "troop-101", "published": True}})
    owner.set("troops/t2", {"name": "Troop 202", "unitNumber": "202", "site": {"slug": "troop-202", "published": True}})
    leader = {"memberId": "m-leader", "roles": ["leader"], "scoutIds": [], "yptExpiresAt": FUTURE}
    owner.set(f"{T}/access/leader", leader)
    owner.set(f"{T}/access/parent", {"memberId": "m-parent", "roles": ["parent"], "scoutIds": ["s1"]})
    owner.set("troops/t2/access/leader2", {**leader, "memberId": "m-l2"})
    owner.set("slugs/troop-101", {"troopId": "t1"})
    owner.set("publicSites/troop-101", {"slug": "troop-101", "troopId": "t1", "troopName": "Troop 101"})
    yield


def test_adding_a_domain_returns_the_dns_steps_and_stores_the_lookup():
    r = add("Troop101Springfield.org")
    assert r.status_code == 200, r.text
    out = r.json()["result"]
    assert out["host"] == "troop101springfield.org" and out["status"] == "waiting_dns"
    assert {(x["type"], x["label"], x["action"]) for x in out["records"]} >= {("A", "@", "add"), ("TXT", "@", "add")}
    assert out["steps"][0].startswith("Sign in to the company where you bought troop101springfield.org")
    assert out["headline"] == "Waiting for your DNS records"

    lookup = read("domains/troop101springfield.org")
    assert lookup["troopId"] == "t1" and lookup["slug"] == "troop-101" and lookup["kind"] == "primary"
    mirror = read(f"{T}/site/domain")
    assert mirror["host"] == "troop101springfield.org" and mirror["wwwHost"] is None
    assert Client("leader").get(f"{T}/site/domain") == 200
    assert Client("leader").get("domains/troop101springfield.org") == 403


def test_the_www_twin_is_added_and_redirects_to_the_main_domain():
    r = add("troop101.org", www=True)
    assert r.status_code == 200, r.text
    assert r.json()["result"]["wwwHost"] == "www.troop101.org"
    www = read("domains/www.troop101.org")
    assert www["kind"] == "www" and www["redirectTo"] == "troop101.org" and www["troopId"] == "t1"


def test_only_leaders_can_manage_the_domain():
    assert add("troop101.org", uid="parent").status_code == 403
    assert add("troop101.org", uid="stranger").status_code == 403
    assert add("troop101.org", uid="leader2").status_code == 403  # leader of another troop
    assert add("troop101.org").status_code == 200
    for name in ("check_domain", "remove_domain"):
        assert call(name, "parent", {"troopId": "t1"}).status_code == 403
    assert read("domains/troop101.org") is not None


@pytest.mark.parametrize(
    "typed",
    [
        "",
        "https://troop101.org",
        "troop101.org/page",
        "forthrightapp.com",
        "www.forthrightapp.com",
        "x.web.app",
        "nodot",
    ],
)
def test_bad_domains_are_refused_and_nothing_is_stored(typed):
    r = add(typed)
    assert r.status_code == 400 and error(r)
    assert list_docs("domains") == [] and read(f"{T}/site/domain") is None


def test_one_domain_per_troop_and_a_domain_belongs_to_one_troop():
    assert add("troop101.org").status_code == 200
    again = add("another.org")
    assert again.status_code == 409 and "already has a domain" in error(again)
    taken = add("troop101.org", uid="leader2", troop="t2")
    assert taken.status_code == 409 and "another troop" in error(taken)
    assert read("domains/troop101.org")["troopId"] == "t1"


def test_the_site_must_be_published_first():
    owner.set(T, {"name": "Troop 101", "unitNumber": "101", "site": {"slug": "troop-101", "published": False}})
    r = add("troop101.org")
    assert r.status_code == 400 and "Publish your website first" in error(r)
    assert list_docs("domains") == []


def test_check_again_follows_the_domain_to_live():
    for host, status in (("troop-dns.org", "verifying"), ("troop-cert.org", "issuing_certificate")):
        assert add(host).status_code == 200
        r = call("check_domain", "leader", {"troopId": "t1"})
        assert r.status_code == 200, r.text
        assert r.json()["result"]["status"] == status
        assert read(f"{T}/site/domain")["status"] == status
        assert read(f"domains/{host}")["status"] == status
        assert call("remove_domain", "leader", {"troopId": "t1"}).status_code == 200

    assert add("troop-live.org").status_code == 200
    live = call("check_domain", "leader", {"troopId": "t1"}).json()["result"]
    assert live["status"] == "live" and live["records"] == [] and "https://troop-live.org" in live["detail"]


def test_a_domain_attached_elsewhere_ends_as_failed():
    assert add("troop-conflict.org").status_code == 200
    out = call("check_domain", "leader", {"troopId": "t1"}).json()["result"]
    assert out["status"] == "failed"
    assert read("domains/troop-conflict.org")["status"] == "failed"


def test_a_domain_not_live_after_seven_days_is_detached_and_reported_to_the_leader():
    assert add("troop101.org", www=True).status_code == 200
    old = datetime.now(UTC) - timedelta(days=8)
    for path in (f"{T}/site/domain", "domains/troop101.org", "domains/www.troop101.org"):
        owner.set(path, {**read(path), "createdAt": old})
    out = call("check_domain", "leader", {"troopId": "t1"}).json()["result"]
    assert out["status"] == "failed" and out["records"] == []
    assert "stopped waiting after 7 days" in out["detail"]
    assert read(f"{T}/site/domain")["status"] == "failed"
    # A failed domain can be removed, then added again.
    assert call("remove_domain", "leader", {"troopId": "t1"}).status_code == 200
    assert add("troop101.org").status_code == 200


def test_removing_the_domain_clears_the_lookup_and_the_status():
    assert add("troop101.org", www=True).status_code == 200
    r = call("remove_domain", "leader", {"troopId": "t1"})
    assert r.status_code == 200 and r.json()["result"] == {"removed": True}
    assert list_docs("domains") == [] and read(f"{T}/site/domain") is None
    assert call("remove_domain", "leader", {"troopId": "t1"}).json()["result"] == {"removed": False}
    assert add("troop101.org", uid="leader2", troop="t2").status_code == 200  # free to be used again


def test_unpublishing_the_site_detaches_the_domain():
    assert add("troop101.org", www=True).status_code == 200
    r = call("unpublish_site", "leader", {"troopId": "t1"})
    assert r.status_code == 200, r.text
    assert list_docs("domains") == [] and read(f"{T}/site/domain") is None
    assert read("publicSites/troop-101") is None


def test_check_with_no_domain_returns_nothing():
    r = call("check_domain", "leader", {"troopId": "t1"})
    assert r.status_code == 200 and r.json()["result"] == {}
