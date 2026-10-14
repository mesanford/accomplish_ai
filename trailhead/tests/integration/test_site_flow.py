"""The troop website on the emulators: publish, slug claims, media consent, unpublish and event refresh."""

import os
import time
from datetime import UTC, date, datetime, timedelta

import pytest
import requests

from tests.rules.emulator import PROJECT, Client, read, reset, token
from tests.rules.storage import Storage, download_public, reset_storage, storage_up

FUNCTIONS = os.environ.get("FUNCTIONS_EMULATOR_URL", "http://127.0.0.1:5001")
T = "troops/t1"
FUTURE = datetime.now(UTC) + timedelta(days=365)
SOON = (date.today() + timedelta(days=10)).isoformat()

pytestmark = pytest.mark.skipif(
    not os.environ.get("RUN_FUNCTIONS_TESTS") or not storage_up(),
    reason="needs the Firestore, Functions and Storage emulators (see README)",
)
owner = Client("owner")


def call(name: str, uid: str, data: dict) -> requests.Response:
    url = f"{FUNCTIONS}/{PROJECT}/us-central1/{name}"
    return requests.post(url, json={"data": data}, headers={"Authorization": f"Bearer {token(uid)}"}, timeout=60)


def wait_for(fn, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        value = fn()
        if value:
            return value
        time.sleep(0.5)
    raise AssertionError("timed out waiting for a function to run")


def photo(name: str, scout_ids: list[str], no_scouts: bool = False) -> dict:
    return {"path": f"sites/t1/draft/{name}", "caption": name, "scoutIds": scout_ids, "noScoutsShown": no_scouts}


def draft(**overrides) -> dict:
    base = {
        "slug": "troop-101-springfield",
        "theme": {"color": "#4f6a2e", "logoPath": "sites/t1/draft/logo.png"},
        "cover": {"heading": "Troop 101", "tagline": "Adventure", "photoPath": "sites/t1/draft/land.png"},
        "about": "We camp every month.",
        "meeting": {"schedule": "Mondays, 7 pm", "place": "St. Mark's Hall", "address": "1 Main St"},
        "faq": [{"q": "Cost?", "a": "$60 a year."}],
        "contacts": [{"memberId": "m-leader", "role": "Scoutmaster", "email": "sm@example.com"}],
        "gallery": [photo("sam.png", ["s1"]), photo("riley.png", ["s2"]), photo("land.png", [], True)],
        "recruiting": {"open": True, "intro": "Come visit."},
    }
    return {**base, **overrides}


@pytest.fixture(autouse=True)
def seeded():
    reset()
    reset_storage()
    owner.set(T, {"name": "Troop 101", "unitNumber": "101", "council": "Lincoln Heritage"})
    owner.set("troops/t2", {"name": "Troop 202", "unitNumber": "202"})
    leader = {"memberId": "m-leader", "roles": ["leader"], "scoutIds": [], "yptExpiresAt": FUTURE}
    owner.set(f"{T}/access/leader", leader)
    owner.set(f"{T}/access/parent", {"memberId": "m-parent", "roles": ["parent"], "scoutIds": ["s1"]})
    owner.set(f"{T}/access/scout1", {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]})
    owner.set("troops/t2/access/leader2", {**leader, "memberId": "m-l2"})
    owner.set(f"{T}/members/m-leader", {"kind": "adult", "displayName": "Pat Leader", "uid": "leader"})
    owner.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam Smith"})
    owner.set(f"{T}/members/s2", {"kind": "scout", "displayName": "Riley Jones"})
    owner.set(f"{T}/site/draft", draft())
    for name in ("logo.png", "sam.png", "riley.png", "land.png"):
        assert Storage("owner").upload(f"sites/t1/draft/{name}") == 200
    yield


def publish(uid: str = "leader", troop_id: str = "t1") -> requests.Response:
    return call("publish_site", uid, {"troopId": troop_id})


def test_publish_builds_a_safe_public_copy():
    assert call("set_media_consent", "parent", {"troopId": "t1", "scoutId": "s1", "granted": True}).status_code == 200
    r = publish()
    assert r.status_code == 200, r.text
    out = r.json()["result"]
    assert out["url"] == "/s/troop-101-springfield"
    assert [(x["caption"], x["reason"]) for x in out["leftOut"]] == [
        ("riley.png", "No media consent recorded for Riley Jones.")
    ]
    site = read("publicSites/troop-101-springfield")
    assert site["troopName"] == "Troop 101" and site["unitNumber"] == "101"
    assert [g["caption"] for g in site["gallery"]] == ["sam.png", "land.png"]
    assert site["contacts"] == [{"name": "Pat Leader", "role": "Scoutmaster", "email": "sm@example.com"}]
    assert "Sam" not in repr(site) and "Riley" not in repr(site)
    for url in [site["theme"]["logoUrl"], site["cover"]["photoUrl"], *(g["url"] for g in site["gallery"])]:
        assert "/sites%2Ft1%2Fpublic%2F" in url
        assert download_public(url).status_code == 200
    assert Storage(None).download("sites/t1/public/riley.png") == 404
    troop = read(T)
    assert troop["site"]["slug"] == "troop-101-springfield" and troop["site"]["published"] is True
    assert read("slugs/troop-101-springfield") == {"troopId": "t1"}


def test_only_leaders_publish_and_drafts_are_checked():
    assert publish("parent").status_code == 403
    owner.set(f"{T}/site/draft", draft(contacts=[{"memberId": "s1", "role": "Patrol leader"}]))
    r = publish()
    assert r.status_code == 400 and "adult" in r.text
    owner.set(f"{T}/site/draft", draft(slug="admin"))
    assert publish().status_code == 400
    owner.set(f"{T}/site/draft", draft(gallery=[photo("missing.png", [], True)]))
    assert publish().status_code == 400
    assert read("publicSites/admin") is None


def test_a_slug_belongs_to_one_troop_and_changing_it_releases_the_old_one():
    assert publish().status_code == 200
    owner.set("troops/t2/site/draft", {**draft(gallery=[], contacts=[]), "theme": {}, "cover": {"heading": "202"}})
    assert publish("leader2", "t2").status_code == 409
    owner.set(f"{T}/site/draft", draft(slug="troop-101"))
    assert publish().status_code == 200
    assert read("publicSites/troop-101-springfield") is None and read("slugs/troop-101-springfield") is None
    assert read("publicSites/troop-101")["slug"] == "troop-101"
    assert publish("leader2", "t2").status_code == 200


def test_unpublish_takes_the_site_down_and_keeps_the_draft():
    assert publish().status_code == 200
    assert call("unpublish_site", "parent", {"troopId": "t1"}).status_code == 403
    assert call("unpublish_site", "leader", {"troopId": "t1"}).status_code == 200
    assert read("publicSites/troop-101-springfield") is None and read("slugs/troop-101-springfield") is None
    assert read(T)["site"]["published"] is False
    assert read(f"{T}/site/draft")["slug"] == "troop-101-springfield"
    assert Storage(None).download("sites/t1/public/land.png") == 404


def test_media_consent_rules_and_withdrawal_takes_photos_down():
    consent = {"troopId": "t1", "scoutId": "s1", "granted": True}
    assert call("set_media_consent", "scout1", consent).status_code == 403
    assert call("set_media_consent", "parent", {**consent, "scoutId": "s2"}).status_code == 403
    assert call("set_media_consent", "leader", {**consent, "scoutId": "s2"}).status_code == 200
    assert read(f"{T}/members/s2")["mediaConsent"]["byMemberId"] == "m-leader"
    assert call("set_media_consent", "parent", consent).status_code == 200
    assert publish().json()["result"]["leftOut"] == []
    assert len(read("publicSites/troop-101-springfield")["gallery"]) == 3

    r = call("set_media_consent", "parent", {**consent, "granted": False})
    assert r.json()["result"]["photosRemoved"] == 1
    assert read(f"{T}/members/s1")["mediaConsent"]["granted"] is False
    assert [g["caption"] for g in read("publicSites/troop-101-springfield")["gallery"]] == ["riley.png", "land.png"]
    assert Storage(None).download("sites/t1/public/sam.png") == 404


def test_public_events_follow_the_calendar():
    owner.set(f"{T}/events/e1", {"title": "Campout", "start": SOON, "public": True, "place": "Camp Lowden"})
    owner.set(f"{T}/events/e2", {"title": "Committee", "start": SOON, "public": False})
    assert publish().status_code == 200
    assert read("publicSites/troop-101-springfield")["events"] == [
        {"title": "Campout", "start": SOON, "place": "Camp Lowden"}
    ]
    owner.set(f"{T}/events/e3", {"title": "Court of Honor", "start": SOON, "public": True})
    titles = wait_for(
        lambda: [e["title"] for e in read("publicSites/troop-101-springfield")["events"]]
        == [
            "Campout",
            "Court of Honor",
        ]
    )
    assert titles


def test_about_helper_for_leaders_never_sees_scout_names():
    notes = {"troopId": "t1", "notes": "Sam Smith just made Eagle. We camp monthly."}
    assert call("draft_site_about", "parent", notes).status_code == 403
    r = call("draft_site_about", "leader", notes)
    assert r.status_code == 200, r.text
    about = r.json()["result"]["about"]
    assert "Troop 101" in about and "camp monthly" in about and "Sam" not in about
    assert call("draft_site_about", "leader", {"troopId": "t1", "notes": ""}).status_code == 400
