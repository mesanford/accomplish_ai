from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
DRAFT = f"{T}/site/draft"
GOOD = {
    "slug": "troop-123",
    "theme": {"color": "#4f6a2e", "logoPath": None},
    "cover": {"heading": "Troop 123", "tagline": "", "photoPath": None},
    "about": "We camp.",
    "meeting": {"schedule": "Mondays", "place": "Hall", "address": None},
    "faq": [],
    "contacts": [],
    "gallery": [],
    "recruiting": {"open": True, "intro": ""},
}


def test_only_leaders_read_and_write_the_draft():
    assert Client("leader").set(DRAFT, GOOD) == OK
    assert Client("leader").get(DRAFT) == OK
    for uid in ("parent", "scout1", "counselor", "stranger", None):
        assert Client(uid).get(DRAFT) == DENIED
        assert Client(uid).set(DRAFT, GOOD) == DENIED


def test_draft_shape_is_checked_loosely():
    leader = Client("leader")
    assert leader.set(DRAFT, {"slug": "troop-123"}) == OK
    assert leader.set(DRAFT, {**GOOD, "extra": 1}) == DENIED
    assert leader.set(DRAFT, {**GOOD, "about": "x" * 4001}) == DENIED
    assert leader.set(DRAFT, {**GOOD, "gallery": [{"path": "p"}] * 25}) == DENIED
    assert leader.set(DRAFT, {**GOOD, "faq": "not a list"}) == DENIED
    assert leader.set(DRAFT, {**GOOD, "cover": "not a map"}) == DENIED


def test_draft_holds_the_scout_tags_for_the_cover_photo_and_logo():
    leader = Client("leader")
    tagged = {
        **GOOD,
        "theme": {"color": "#4f6a2e", "logoPath": "p", "logoScoutIds": ["s1"], "logoNoScoutsShown": False},
        "cover": {
            "heading": "T",
            "tagline": "",
            "photoPath": "p",
            "photoScoutIds": [],
            "photoNoScoutsShown": True,
        },
    }
    assert leader.set(DRAFT, tagged) == OK
    too_many = {
        "heading": "T",
        "tagline": "",
        "photoPath": "p",
        "photoScoutIds": [],
        "photoNoScoutsShown": True,
        "x": 1,
    }
    assert leader.set(DRAFT, {**GOOD, "cover": too_many}) == DENIED


def test_draft_holds_pages_an_announcement_and_a_cover_layout():
    leader = Client("leader")
    page = {
        "id": "p1",
        "title": "High adventure",
        "slug": "high-adventure",
        "blocks": [{"type": "heading", "text": "Hi"}],
    }
    banner = {"text": "Camp fees due", "endDate": "2026-11-01"}
    assert leader.set(DRAFT, {**GOOD, "pages": [page], "announcement": banner, "coverLayout": "split"}) == OK
    assert leader.set(DRAFT, {**GOOD, "pages": [page] * 10}) == OK
    assert leader.set(DRAFT, {**GOOD, "pages": [page] * 11}) == DENIED
    assert leader.set(DRAFT, {**GOOD, "pages": "not a list"}) == DENIED
    assert leader.set(DRAFT, {**GOOD, "announcement": "not a map"}) == DENIED
    assert leader.set(DRAFT, {**GOOD, "coverLayout": "x" * 21}) == DENIED
    for uid in ("parent", "scout1", "counselor", "stranger", None):
        assert Client(uid).set(DRAFT, {**GOOD, "pages": [page]}) == DENIED


def test_published_record_is_server_only():
    path = f"{T}/site/published"
    assert Client("owner").set(path, {"slug": "troop-123", "gallery": []}) == OK
    assert Client("leader").get(path) == OK
    assert Client("parent").get(path) == DENIED
    assert Client("leader").set(path, {"slug": "x"}) == DENIED


def test_public_sites_are_world_readable_and_server_written():
    assert Client("owner").set("publicSites/troop-123", {"slug": "troop-123", "troopId": "t1"}) == OK
    assert Client(None).get("publicSites/troop-123") == OK
    assert Client("stranger").get("publicSites/troop-123") == OK
    for uid in ("leader", "stranger", None):
        assert Client(uid).set("publicSites/troop-123", {"slug": "hijacked"}) == DENIED
        assert Client(uid).delete("publicSites/troop-123") == DENIED


def test_slug_claims_are_invisible_to_clients():
    assert Client("owner").set("slugs/troop-123", {"troopId": "t1"}) == OK
    for uid in ("leader", "stranger", None):
        assert Client(uid).get("slugs/troop-123") == DENIED
        assert Client(uid).set("slugs/troop-999", {"troopId": "t1"}) == DENIED


def test_media_consent_cannot_be_written_from_the_app():
    leader = Client("leader")
    consent = {"granted": True, "byMemberId": "m-leader"}
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "patrol": "Eagles"}) == OK
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sam", "mediaConsent": consent}) == DENIED
    assert leader.set(f"{T}/members/s9", {"kind": "scout", "displayName": "New", "mediaConsent": consent}) == DENIED
    assert Client("parent").set(f"{T}/members/s1", {"kind": "scout", "mediaConsent": consent}) == DENIED
    # Once the server records consent, leaders can still edit the rest of the member as long as it is kept.
    recorded = {"kind": "scout", "displayName": "Sam", "mediaConsent": consent}
    assert Client("owner").set(f"{T}/members/s1", recorded) == OK
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sammy", "mediaConsent": consent}) == OK
    assert leader.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Sammy"}) == DENIED
