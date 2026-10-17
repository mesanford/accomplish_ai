"""End-to-end: posting, emailing, editing, deleting and retiring announcements. The emulator logs email (EMAIL_MODE=log)
and writes each one to `emailOutbox`, so these tests see exactly who would have been emailed."""

import os
from datetime import UTC, date, datetime, timedelta

import pytest
import requests

from tests.integration.test_functions import call, owner
from tests.rules.emulator import PROJECT, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
AUTH = f"http://{os.environ.get('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')}"
T = "troops/tn"
FUTURE = datetime.now(UTC) + timedelta(days=365)
PAST = datetime.now(UTC) - timedelta(days=30)
ADULTS = {  # uid: (roles, training expiry, Scouts they are the parent of)
    "lead": (["leader", "scoutmaster"], FUTURE, []),
    "asst": (["leader"], FUTURE, []),
    "com": (["committee"], FUTURE, []),
    "lapsed": (["committee"], PAST, []),
    "mom": (["parent"], None, ["s1"]),
    "dad": (["parent"], None, ["s2"]),
    "quiet": (["parent"], None, ["s1"]),  # turned announcement emails off
    "pending": (["parent"], None, ["s1"]),  # has not agreed to the consent notice yet
}


def email_of(uid: str) -> str:
    return f"{uid}@example.test"


def sent_to() -> set[str]:
    return {m["to"] for m in list_docs("emailOutbox") if m["template"] == "announcement"}


def post(uid="lead", audience=None, **extra):
    body = {"troopId": "tn", "title": "Campout", "body": "Bring a coat.", "audience": audience or {"type": "parents"}}
    return call("post_announcement", uid, {**body, **extra})


def posted(response) -> dict:
    assert response.status_code == 200, response.text
    return response.json()["result"]


@pytest.fixture(autouse=True)
def seeded():
    reset()
    requests.delete(f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts", timeout=10)
    users = [{"localId": u, "email": email_of(u)} for u in [*ADULTS, "scout1", "chair"]]
    url = f"{AUTH}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:batchCreate"
    requests.post(url, json={"users": users}, headers={"Authorization": "Bearer owner"}, timeout=10).raise_for_status()
    owner.set(T, {"name": "Troop 9", "unitNumber": "9"})
    owner.set("users/quiet", {"emailAnnouncements": False})
    owner.set(f"{T}/members/s1", {"kind": "scout", "displayName": "Ava Jones", "uid": "scout1", "guardianIds": []})
    owner.set(f"{T}/members/s2", {"kind": "scout", "displayName": "Sam Smith", "guardianIds": ["m-dad"]})
    owner.set(f"{T}/access/scout1", {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]})
    for uid, (roles, ypt, kids) in ADULTS.items():
        member = {"kind": "adult", "displayName": f"{uid.title()} Person", "uid": uid, "roles": roles}
        access = {"memberId": f"m-{uid}", "roles": roles, "scoutIds": kids}
        if ypt:
            member["yptExpiresAt"] = access["yptExpiresAt"] = ypt
        if uid == "pending":
            access["consentPendingScoutIds"] = ["s1"]
        owner.set(f"{T}/members/m-{uid}", member)
        owner.set(f"{T}/access/{uid}", access)
    owner.set(
        f"{T}/members/s1",
        {
            "kind": "scout",
            "displayName": "Ava Jones",
            "uid": "scout1",
            "guardianIds": ["m-mom", "m-quiet", "m-pending"],
        },
    )
    owner.set(f"{T}/events/e1", {"title": "Fall campout", "start": "2026-10-24", "place": "Camp Bell"})
    yield


def test_a_leader_posts_to_parents_and_those_who_want_it_are_emailed():
    result = posted(post(email=True))
    assert result["emailed"] == 3 and sent_to() == {email_of(u) for u in ("mom", "dad", "pending")}
    doc = read(f"{T}/announcements/{result['announcementId']}")
    assert doc["readerUids"] == ["dad", "lead", "mom", "pending", "quiet"]  # the poster and Scoutmaster too
    assert doc["postedByName"] == "Lead Person" and doc["audienceLabel"] == "All parents" and doc["emailed"] == 3
    [mail] = [m for m in list_docs("emailOutbox") if m["to"] == email_of("mom")]
    assert mail["subject"] == "Troop 9: Campout"
    assert "Lead Person" in mail["text"] and "/t/tn/announcements#" in mail["text"] and "/account" in mail["text"]


def test_a_post_without_the_email_box_sends_nothing():
    assert posted(post())["emailed"] == 0 and sent_to() == set()


def test_scouts_and_the_poster_are_never_emailed():
    posted(post(audience={"type": "troop"}, email=True))
    assert email_of("scout1") not in sent_to() and email_of("lead") not in sent_to()
    assert email_of("asst") in sent_to() and email_of("com") in sent_to()


def test_a_scout_in_the_audience_can_read_it_and_a_parent_only_audience_excludes_them():
    everyone = posted(post(audience={"type": "troop"}))["announcementId"]
    parents = posted(post())["announcementId"]
    assert "scout1" in read(f"{T}/announcements/{everyone}")["readerUids"]
    assert "scout1" not in read(f"{T}/announcements/{parents}")["readerUids"]


def test_only_trained_adults_post_to_audiences_with_scouts():
    denied = post("lapsed", audience={"type": "troop"})
    assert denied.status_code == 403 and "Youth Protection" in denied.text
    assert post("lapsed", audience={"type": "event", "eventId": "e1"}).status_code == 200  # no Scouts signed up
    assert post("lapsed", audience={"type": "adults"}).status_code == 200  # no Scouts in it
    assert post("com", audience={"type": "troop"}).status_code == 200


def test_event_audience_uses_sign_ups_with_rsvps_as_the_fallback():
    owner.set(f"{T}/events/e1/signups/m-com", {"memberId": "m-com"})
    owner.set(f"{T}/events/e1/signups/s2", {"status": "going"})
    owner.set(f"{T}/events/e1/signups/m-asst", {"status": "declined"})
    first = posted(post(audience={"type": "event", "eventId": "e1"}, email=True))
    assert sent_to() == {email_of("com"), email_of("dad")}  # a signed-up Scout's parent is included
    assert first["emailed"] == 2
    owner.set(f"{T}/events/e2", {"title": "Hike", "start": "2026-11-01"})
    owner.set(f"{T}/events/e2/rsvps/m-mom", {})
    later = posted(post(audience={"type": "event", "eventId": "e2"}))["announcementId"]
    assert "mom" in read(f"{T}/announcements/{later}")["readerUids"]


def test_parents_of_chosen_scouts_skip_a_parent_who_has_not_agreed():
    post_id = posted(post(audience={"type": "parentsOf", "scoutIds": ["s1"]}))["announcementId"]
    assert read(f"{T}/announcements/{post_id}")["readerUids"] == ["lead", "mom", "quiet"]


def test_only_leaders_and_committee_members_can_post_and_bad_input_is_refused():
    assert post("mom").status_code == 403 and post("scout1").status_code == 403
    assert post("stranger").status_code == 403
    assert post(title="").status_code == 400 and post(audience={"type": "everyone"}).status_code == 400
    assert post(body="x" * 5001).status_code == 400
    assert post(audience={"type": "event", "eventId": "nope"}).status_code == 400


def test_a_newsletter_has_sections_and_linked_events():
    result = posted(
        call(
            "post_announcement",
            "lead",
            {
                "troopId": "tn",
                "kind": "newsletter",
                "title": "October news",
                "audience": {"type": "adults"},
                "sections": [{"heading": "Thanks", "text": "Great campout."}],
                "eventIds": ["e1"],
                "email": True,
            },
        )
    )
    doc = read(f"{T}/announcements/{result['announcementId']}")
    assert doc["kind"] == "newsletter" and doc["sections"][0]["heading"] == "Thanks"
    assert doc["events"][0]["title"] == "Fall campout"
    [mail] = [m for m in list_docs("emailOutbox") if m["to"] == email_of("mom")]
    assert "THANKS" in mail["text"] and "Fall campout" in mail["text"] and "Camp Bell" in mail["text"]


def test_five_emailed_announcements_a_day_and_the_sixth_is_refused():
    for _ in range(5):
        posted(post(email=True))
    before = len(list_docs(f"{T}/announcements"))
    refused = post(email=True)
    assert refused.status_code == 429 and "5 announcements" in refused.text
    assert len(list_docs(f"{T}/announcements")) == before  # nothing was posted
    assert posted(post())["emailed"] == 0  # posting without email still works


def test_editing_marks_the_post_and_never_emails_again():
    result = posted(post(email=True))
    outbox = len(list_docs("emailOutbox"))
    edit = {"troopId": "tn", "announcementId": result["announcementId"], "title": "Campout moved", "body": "New day."}
    assert call("edit_announcement", "asst", edit).status_code == 403  # not the poster or the Scoutmaster
    assert call("edit_announcement", "lead", {**edit, "pinned": True}).status_code == 200
    doc = read(f"{T}/announcements/{result['announcementId']}")
    assert doc["title"] == "Campout moved" and doc["pinned"] is True and doc["editedAt"]
    assert doc["audience"] == {"type": "parents"} and doc["readerUids"] == ["dad", "lead", "mom", "pending", "quiet"]
    assert len(list_docs("emailOutbox")) == outbox


def test_the_poster_and_the_scoutmaster_delete_and_others_cannot():
    mine = posted(post("com", audience={"type": "adults"}))["announcementId"]
    ref = f"{T}/announcements/{mine}"
    args = {"troopId": "tn", "announcementId": mine}
    assert call("delete_announcement", "asst", args).status_code == 403
    assert call("delete_announcement", "mom", args).status_code == 403
    assert call("delete_announcement", "com", args).status_code == 200 and read(ref) is None
    other = posted(post("com", audience={"type": "adults"}))["announcementId"]
    assert call("delete_announcement", "lead", {"troopId": "tn", "announcementId": other}).status_code == 200
    assert call("delete_announcement", "lead", {"troopId": "tn", "announcementId": other}).status_code == 404


def test_each_person_can_turn_announcement_emails_off_and_on():
    assert call("set_email_announcements", "mom", {"enabled": False}).status_code == 200
    assert read("users/mom")["emailAnnouncements"] is False
    assert call("set_email_announcements", "mom", {"enabled": "no"}).status_code == 400
    posted(post(email=True))
    assert email_of("mom") not in sent_to()
    call("set_email_announcements", "mom", {"enabled": True})
    assert read("users/mom")["emailAnnouncements"] is True


def test_the_nightly_job_deletes_announcements_24_months_after_posting():
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    from endpoints.retention import Budget, run_retention

    now = datetime(2026, 10, 14, 12, tzinfo=UTC)
    owner.set(f"{T}/announcements/old", {"title": "Old", "createdAt": now - timedelta(days=365 * 2 + 5)})
    owner.set(f"{T}/announcements/new", {"title": "New", "createdAt": now - timedelta(days=365)})
    edited = {"title": "Edited", "createdAt": now - timedelta(days=800), "editedAt": now - timedelta(days=1)}
    owner.set(f"{T}/announcements/edited", edited)
    assert run_retention(date(2026, 10, 14), True, Budget())["announcements"] == 2
    assert read(f"{T}/announcements/old") is None and read(f"{T}/announcements/edited") is None
    assert read(f"{T}/announcements/new") is not None


def test_people_who_join_later_can_read_the_last_twelve_months_for_their_audience():
    from tests.integration.test_functions import wait_for

    recent = posted(post(audience={"type": "parents"}))["announcementId"]
    leaders_only = posted(post(audience={"type": "leaders"}))["announcementId"]
    old = posted(post(audience={"type": "parents"}))["announcementId"]
    owner.set(
        f"{T}/announcements/{old}",
        {**read(f"{T}/announcements/{old}"), "createdAt": datetime.now(UTC) - timedelta(days=400)},
    )

    owner.set(
        f"{T}/members/m-newbie", {"kind": "adult", "displayName": "Newbie Person", "uid": "newbie", "roles": ["parent"]}
    )
    owner.set(f"{T}/access/newbie", {"memberId": "m-newbie", "roles": ["parent"], "scoutIds": ["s2"]})
    wait_for(lambda: "newbie" in read(f"{T}/announcements/{recent}")["readerUids"])
    assert "newbie" not in read(f"{T}/announcements/{leaders_only}")["readerUids"]  # not their audience
    assert "newbie" not in read(f"{T}/announcements/{old}")["readerUids"]  # older than 12 months

    # Gaining a role later opens that role's recent posts too.
    owner.set(f"{T}/access/newbie", {"memberId": "m-newbie", "roles": ["parent", "leader"], "scoutIds": ["s2"]})
    wait_for(lambda: "newbie" in read(f"{T}/announcements/{leaders_only}")["readerUids"])


def add_advancement_chair() -> None:
    member = {"kind": "adult", "displayName": "Chair Person", "uid": "chair", "roles": ["advancement"]}
    owner.set(f"{T}/members/m-chair", member)
    access = {"memberId": "m-chair", "roles": ["advancement"], "scoutIds": [], "yptExpiresAt": FUTURE}
    owner.set(f"{T}/access/chair", access)


def test_the_advancement_chair_reads_edits_and_deletes_any_post():
    add_advancement_chair()
    result = posted(post("com", audience={"type": "adults"}))["announcementId"]
    # A reader like the Scoutmaster, whatever the audience.
    assert "chair" in read(f"{T}/announcements/{result}")["readerUids"]
    parents_only = posted(post("com", audience={"type": "parents"}))["announcementId"]
    assert "chair" in read(f"{T}/announcements/{parents_only}")["readerUids"]
    edit = {"troopId": "tn", "announcementId": parents_only, "title": "Changed", "body": "New day."}
    assert call("edit_announcement", "chair", edit).status_code == 200
    assert call("delete_announcement", "chair", {"troopId": "tn", "announcementId": parents_only}).status_code == 200
    assert call("delete_announcement", "asst", {"troopId": "tn", "announcementId": result}).status_code == 403


def test_an_advancement_chair_who_arrives_later_can_read_recent_posts_outside_their_audience():
    from tests.integration.test_functions import wait_for

    recent = posted(post(audience={"type": "parents"}))["announcementId"]
    old = posted(post(audience={"type": "parents"}))["announcementId"]
    owner.set(
        f"{T}/announcements/{old}",
        {**read(f"{T}/announcements/{old}"), "createdAt": datetime.now(UTC) - timedelta(days=400)},
    )
    add_advancement_chair()
    wait_for(lambda: "chair" in read(f"{T}/announcements/{recent}")["readerUids"])
    assert "chair" not in read(f"{T}/announcements/{old}")["readerUids"]  # older than 12 months
