"""End-to-end: each email trigger picks the right people. The emulator logs email and writes it to `emailOutbox`."""

import os
import time

import pytest
import requests

from tests.integration.test_functions import call, owner, wait_for
from tests.integration.test_membership_flow import AGREE
from tests.rules.emulator import PROJECT, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
AUTH = f"http://{os.environ.get('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')}"
T = "troops/tn"
CARD = f"{T}/blueCards/s1_camping"
CARD_DOC = {"scoutId": "s1", "awardId": "camping", "versionId": "v1", "status": "requested"}
ADULTS = {
    "lead": ["leader", "scoutmaster"],
    "asst": ["leader"],  # an assistant leader, who does not approve blue cards
    "chair": ["advancement"],
    "quiet": ["scoutmaster"],  # a Scoutmaster who turned notifications off
    "mom": ["parent"],
    "dad": ["parent"],
    "pending": ["parent"],  # linked by a leader, has not agreed to the notice yet
    "mbc": ["counselor"],
}


def email_of(uid: str) -> str:
    return f"{uid}@example.test"


def outbox(template: str) -> list[dict]:
    return [m for m in list_docs("emailOutbox") if m["template"] == template]


def recipients(template: str, count: int) -> set[str]:
    """Wait for `count` emails of a kind, give a stray one time to show up, then return who got them."""
    wait_for(lambda: len(outbox(template)) >= count)
    time.sleep(1.5)
    sent = outbox(template)
    assert len(sent) == count, [m["to"] for m in sent]
    return {m["to"] for m in sent}


@pytest.fixture(autouse=True)
def seeded():
    reset()
    requests.delete(f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts", timeout=10)
    users = [{"localId": uid, "email": email_of(uid)} for uid in ADULTS]
    url = f"{AUTH}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:batchCreate"
    requests.post(url, json={"users": users}, headers={"Authorization": "Bearer owner"}, timeout=10).raise_for_status()
    owner.set(T, {"name": "Troop 9", "unitNumber": "9"})
    owner.set("users/quiet", {"emailNotifications": False})
    owner.set(
        f"{T}/members/s1", {"kind": "scout", "displayName": "Ava Jones", "guardianIds": ["m-mom", "m-dad", "m-pending"]}
    )
    for uid, roles in ADULTS.items():
        owner.set(f"{T}/members/m-{uid}", {"kind": "adult", "displayName": uid.title(), "uid": uid, "roles": roles})
        access = {"memberId": f"m-{uid}", "roles": roles}
        if "parent" in roles:
            access["scoutIds"] = ["s1"]
        if uid == "pending":
            access["consentPendingScoutIds"] = ["s1"]
        owner.set(f"{T}/access/{uid}", access)
    yield


def test_a_new_request_goes_to_scoutmasters_and_chairs_who_want_it():
    owner.set(CARD, CARD_DOC)
    assert recipients("card_requested", 2) == {email_of("lead"), email_of("chair")}
    [mail, _] = outbox("card_requested")
    assert mail["subject"] == "Ava asked to start Camping"
    assert "Jones" not in mail["text"] and "/t/tn/blue-cards" in mail["text"]
    assert "The Scoutmaster or advancement chair needs to approve the blue card." in mail["text"]


def test_approval_assignment_and_completion_go_to_confirmed_parents_and_the_counselor():
    owner.set(CARD, CARD_DOC)
    recipients("card_requested", 2)
    owner.set(CARD, {**CARD_DOC, "status": "approved"})
    assert recipients("card_approved", 2) == {email_of("mom"), email_of("dad")}  # not the pending parent

    assigned = {**CARD_DOC, "status": "counselor_assigned", "counselorUid": "mbc"}
    owner.set(CARD, assigned)
    assert recipients("card_assigned", 2) == {email_of("mom"), email_of("dad")}
    assert recipients("counselor_assigned", 1) == {email_of("mbc")}
    assert "/t/tn/counseling" in outbox("counselor_assigned")[0]["text"]

    owner.set(CARD, {**assigned, "status": "complete"})
    assert recipients("card_completed", 2) == {email_of("mom"), email_of("dad")}
    assert len(outbox("card_requested")) == 2  # nothing else was sent to leaders


def test_a_parent_who_turned_notifications_off_is_skipped():
    assert call("set_email_notifications", "mom", {"enabled": "no"}).status_code == 400
    assert call("set_email_notifications", "mom", {"enabled": False}).status_code == 200
    assert read("users/mom")["emailNotifications"] is False
    owner.set(CARD, {**CARD_DOC, "status": "approved"})
    assert recipients("card_approved", 1) == {email_of("dad")}
    assert call("set_email_notifications", "mom", {"enabled": True}).status_code == 200
    assert read("users/mom")["emailNotifications"] is True


def test_a_paper_card_sends_nothing():
    owner.set(CARD, {**CARD_DOC, "status": "complete", "source": "paper"})
    time.sleep(3)
    assert list_docs("emailOutbox") == []


def test_consent_confirmation_goes_to_the_parent_even_if_notifications_are_off():
    owner.set("users/pending", {"emailNotifications": False})
    response = call("answer_pending_consent", "pending", {"troopId": "tn", **AGREE})
    assert response.status_code == 200, response.text
    assert recipients("consent_confirmation", 1) == {email_of("pending")}
    [mail] = outbox("consent_confirmation")
    assert mail["subject"] == "You agreed to Forthright's notice for Ava"
    assert "2026-10-15.3" in mail["text"] and "/privacy" in mail["text"]
    assert "Jones" not in mail["text"]
