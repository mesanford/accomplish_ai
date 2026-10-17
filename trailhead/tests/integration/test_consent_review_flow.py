"""End-to-end: parents who agreed to an older notice review the current one, and leaders can remind them."""

import os
from datetime import UTC, datetime, timedelta

import pytest
import requests

from handlers.consent import CONSENT_NOTICE_VERSION
from tests.integration.test_functions import call, owner
from tests.rules.emulator import PROJECT, list_docs, read, reset

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
AUTH = f"http://{os.environ.get('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')}"
T = "troops/tn"
OLD = "2026-10-16.1"
AGREE = {"troopId": "tn", "consent": True, "consentVersion": CONSENT_NOTICE_VERSION}
ADULTS = {"lead": ["leader"], "mom": ["parent"], "dad": ["parent"], "quiet": ["parent"]}
GUARDIANS = {"s1": ["m-mom", "m-dad", "m-quiet"], "s2": ["m-mom"]}
LONG_AGO = datetime(2026, 10, 1, tzinfo=UTC)


def email_of(uid: str) -> str:
    return f"{uid}@example.test"


def entry(uid: str, version: str) -> dict:
    return {"uid": uid, "memberId": f"m-{uid}", "at": LONG_AGO, "version": version}


def ok(response) -> dict:
    assert response.status_code == 200, response.text
    return response.json()["result"]


def outbox(template: str) -> list[dict]:
    return [m for m in list_docs("emailOutbox") if m["template"] == template]


def versions(scout_id: str) -> list[tuple[str, str]]:
    return [(e["uid"], e["version"]) for e in read(f"{T}/consents/{scout_id}")["parentConsents"]]


@pytest.fixture(autouse=True)
def seeded():
    reset()
    requests.delete(f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts", timeout=10)
    users = [{"localId": uid, "email": email_of(uid)} for uid in ADULTS]
    url = f"{AUTH}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:batchCreate"
    requests.post(url, json={"users": users}, headers={"Authorization": "Bearer owner"}, timeout=10).raise_for_status()
    owner.set(T, {"name": "Troop 9", "unitNumber": "9"})
    owner.set("users/quiet", {"emailNotifications": False})
    for sid, name in (("s1", "Ava Jones"), ("s2", "Ben Jones")):
        owner.set(f"{T}/members/{sid}", {"kind": "scout", "displayName": name, "guardianIds": GUARDIANS[sid]})
    for uid, roles in ADULTS.items():
        owner.set(f"{T}/members/m-{uid}", {"kind": "adult", "displayName": uid.title(), "uid": uid, "roles": roles})
        access = {"memberId": f"m-{uid}", "roles": roles}
        if "parent" in roles:
            access["scoutIds"] = [s for s, g in GUARDIANS.items() if f"m-{uid}" in g]
        owner.set(f"{T}/access/{uid}", access)
    owner.set(
        f"{T}/consents/s1",
        {"parentConsents": [entry("mom", OLD), entry("dad", CONSENT_NOTICE_VERSION), entry("quiet", OLD)]},
    )
    owner.set(f"{T}/consents/s2", {"parentConsents": [entry("mom", OLD)]})
    yield


def test_a_parent_agrees_again_and_the_old_entries_stay():
    assert ok(call("review_consent_notice", "mom", AGREE))["reviewed"] == ["s1", "s2"]
    assert versions("s1") == [
        ("mom", OLD),
        ("dad", CONSENT_NOTICE_VERSION),
        ("quiet", OLD),
        ("mom", CONSENT_NOTICE_VERSION),
    ]
    assert versions("s2") == [("mom", OLD), ("mom", CONSENT_NOTICE_VERSION)]
    assert len(outbox("consent_confirmation")) == 1  # a copy of what they agreed to
    assert ok(call("review_consent_notice", "mom", AGREE))["reviewed"] == []  # nothing left to review
    assert len(versions("s1")) == 4


def test_a_parent_who_is_up_to_date_adds_nothing():
    assert ok(call("review_consent_notice", "dad", AGREE))["reviewed"] == []
    assert len(versions("s1")) == 3


def test_not_agreeing_changes_nothing_and_withdraws_nothing():
    for body in ({"troopId": "tn", "consent": False, "consentVersion": CONSENT_NOTICE_VERSION}, {"troopId": "tn"}):
        assert call("review_consent_notice", "mom", body).status_code == 400
    stale = {**AGREE, "consentVersion": OLD}
    assert call("review_consent_notice", "mom", stale).status_code == 400  # must be the current notice
    consent = read(f"{T}/consents/s1")
    assert "withdrawal" not in consent and len(consent["parentConsents"]) == 3
    assert "withdrawal" not in read(f"{T}/consents/s2")
    assert read(f"{T}/access/mom")["scoutIds"] == ["s1", "s2"]  # still linked


def test_only_a_parent_can_agree():
    assert call("review_consent_notice", "lead", AGREE).status_code == 403
    assert call("review_consent_notice", "stranger", AGREE).status_code == 403


NOTE = "even though you turned off notification emails"


def test_a_leader_reminds_parents_once_a_week_never_the_scouts_and_opted_out_parents_still_get_it():
    result = ok(call("send_consent_reminders", "lead", {"troopId": "tn"}))
    assert result["sent"] == 2 and result["recentlyReminded"] == 0
    mails = {m["to"]: m for m in outbox("consent_review_reminder")}
    assert set(mails) == {email_of("mom"), email_of("quiet")}  # dad is up to date; the Scouts are never emailed
    assert mails[email_of("mom")]["subject"] == "Forthright's notice for Ava and Ben changed"
    assert "Jones" not in mails[email_of("mom")]["text"]
    assert NOTE not in mails[email_of("mom")]["text"]
    assert NOTE in mails[email_of("quiet")]["text"]  # turned off notification emails: told why they still got this
    record = read(f"{T}/consentReminders/mom")
    assert record["version"] == CONSENT_NOTICE_VERSION and record["count"] == 1

    again = ok(call("send_consent_reminders", "lead", {"troopId": "tn"}))
    assert again["sent"] == 0 and again["recentlyReminded"] == 2
    assert len(outbox("consent_review_reminder")) == 2

    back = {
        "version": CONSENT_NOTICE_VERSION,
        "count": 1,
        "firstAt": LONG_AGO,
        "lastAt": datetime.now(UTC) - timedelta(days=8),
    }
    owner.set(f"{T}/consentReminders/mom", back)
    assert ok(call("send_consent_reminders", "lead", {"troopId": "tn"}))["sent"] == 1
    assert read(f"{T}/consentReminders/mom")["count"] == 2


def test_no_more_than_four_emails_per_notice_version():
    full = {"version": CONSENT_NOTICE_VERSION, "count": 4, "firstAt": LONG_AGO, "lastAt": LONG_AGO}
    owner.set(f"{T}/consentReminders/mom", full)
    owner.set(f"{T}/consentReminders/quiet", full)
    assert ok(call("send_consent_reminders", "lead", {"troopId": "tn"}))["sent"] == 0
    owner.set(f"{T}/consentReminders/mom", {**full, "version": OLD})  # counted for an older version: starts again
    assert ok(call("send_consent_reminders", "lead", {"troopId": "tn"}))["sent"] == 1


def test_the_daily_job_emails_out_of_date_parents_by_itself_and_not_twice():
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    from endpoints.consent_notices import run_notices

    now = datetime.now(UTC)
    first = run_notices(now)
    assert first["reviewEmails"] == 2 and len(outbox("consent_review_reminder")) == 2
    assert run_notices(now + timedelta(hours=3))["reviewEmails"] == 0  # idempotent within the week
    for week in (1, 2, 3, 4, 5):
        run_notices(now + timedelta(days=7 * week))
    assert len(outbox("consent_review_reminder")) == 8  # two parents, four emails each, then it stops
    ok(call("review_consent_notice", "mom", AGREE))
    assert run_notices(now + timedelta(days=60))["reviewEmails"] == 0  # an answer, or the cap, ends it


def test_nobody_is_reminded_once_they_have_agreed_and_only_leaders_can_send():
    assert call("send_consent_reminders", "mom", {"troopId": "tn"}).status_code == 403
    ok(call("review_consent_notice", "mom", AGREE))
    # Mom agreed, so only the parent who turned off notification emails, and still hasn't reviewed, is reminded
    assert ok(call("send_consent_reminders", "lead", {"troopId": "tn"}))["sent"] == 1
    assert [m["to"] for m in outbox("consent_review_reminder")] == [email_of("quiet")]


def test_no_reminder_goes_to_a_parent_after_they_withdrew():
    owner.set(f"{T}/consents/s2", {"parentConsents": [entry("mom", OLD)], "withdrawal": entry("mom", OLD)})
    owner.set(f"{T}/consents/s1", {"parentConsents": [entry("mom", OLD)], "withdrawal": entry("mom", OLD)})
    assert ok(call("send_consent_reminders", "lead", {"troopId": "tn"}))["sent"] == 0
