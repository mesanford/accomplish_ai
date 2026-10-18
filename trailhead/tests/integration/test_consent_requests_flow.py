"""End-to-end: a Scout under 13 waits for a parent's consent, given by email. Covers the email, the personal link,
agreeing, declining, split households, the blocked writes, resend limits, the daily job and the 30-day clean-up."""

import os
from datetime import UTC, date, datetime, timedelta

import pytest
import requests

from tests.integration.test_functions import call, owner
from tests.integration.test_membership_flow import AGREE, new_troop, ok
from tests.rules.emulator import PROJECT, list_docs, read, reset
from tests.rules.storage import reset_storage

pytestmark = pytest.mark.skipif(
    not os.environ.get("FIRESTORE_EMULATOR_HOST") or not os.environ.get("RUN_FUNCTIONS_TESTS"),
    reason="needs Firestore and Functions emulators (see README)",
)
AUTH = f"http://{os.environ.get('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')}"
YOUNG = date.today().year - 10
MOM, DAD = {"name": "Jordan Parent", "email": "mom@example.test"}, {"name": "Chris Parent", "email": "dad@example.test"}
NOTE = "even though you turned off notification emails"
WAITING = "waiting for a parent"


@pytest.fixture(autouse=True)
def clean():
    # The daily job runs in this test process (see run_notices below). Like the Functions emulator, it then records
    # each email in emailOutbox instead of sending it. Set here so it doesn't depend on which test ran first.
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    reset()
    reset_storage()
    requests.delete(f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts", timeout=10)
    owner.set("awards/art", {"name": "Art", "currentVersionId": "v1"})
    users = [{"localId": uid, "email": f"{uid}@example.test"} for uid in ("mom", "dad", "other")]
    url = f"{AUTH}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:batchCreate"
    requests.post(url, json={"users": users}, headers={"Authorization": "Bearer owner"}, timeout=10).raise_for_status()
    yield


def outbox(template: str) -> list[dict]:
    return [m for m in list_docs("emailOutbox") if m["template"] == template]


def add_young(tid: str, parents=(MOM,), name: str = "Riley") -> str:
    form = {"troopId": tid, "displayName": name, "birthYear": YOUNG, "birthMonth": 3, "currentRankId": "scout"}
    return ok(call("add_scout", "lead", {**form, "parents": list(parents)}))["scoutId"]


def request_of(tid: str, sid: str) -> dict:
    return read(f"troops/{tid}/consentRequests/{sid}")


def code_of(tid: str, sid: str, email: str) -> str:
    return next(p["code"] for p in request_of(tid, sid)["parents"] if p["email"] == email)


def accept(tid: str, sid: str, uid: str, email: str):
    body = {"troopId": tid, "code": code_of(tid, sid, email), "displayName": uid.title(), **AGREE}
    return call("accept_invite", uid, body)


def test_adding_a_scout_under_13_needs_a_parent_email_and_holds_the_scout():
    tid = new_troop("101")
    form = {"troopId": tid, "displayName": "Riley", "birthYear": YOUNG, "birthMonth": 3, "currentRankId": "scout"}
    assert call("add_scout", "lead", form).status_code == 400  # a leader can't confirm for the parent
    assert call("add_scout", "lead", {**form, "leaderConfirmed": True}).status_code == 400
    sid = add_young(tid, [MOM, DAD])
    assert read(f"troops/{tid}/members/{sid}")["consentHold"] is True
    assert "parentConsents" not in (read(f"troops/{tid}/consents/{sid}") or {})
    assert [p["status"] for p in request_of(tid, sid)["parents"]] == ["emailed", "emailed"]
    mails = {m["to"]: m for m in outbox("consent_request")}
    assert set(mails) == {"mom@example.test", "dad@example.test"}  # emailed directly, each their own link
    for email, mail in mails.items():
        assert f"/join/{tid}/{code_of(tid, sid, email)}" in mail["text"]
        assert "30 days" in mail["text"] and "Riley" in mail["text"]


def test_the_email_is_sent_even_to_a_parent_who_turned_notification_emails_off_and_says_why():
    owner.set("users/mom", {"emailNotifications": False})
    tid = new_troop("102")
    add_young(tid, [MOM, DAD])
    mails = {m["to"]: m for m in outbox("consent_request")}
    assert NOTE in mails["mom@example.test"]["text"] and "Riley's information" in mails["mom@example.test"]["text"]
    assert NOTE not in mails["dad@example.test"]["text"]


def test_nothing_else_can_be_collected_for_a_waiting_scout_until_a_parent_agrees():
    tid = new_troop("103")
    sid = add_young(tid)
    entry = {
        "troopId": tid,
        "scoutId": sid,
        "kind": "service",
        "date": "2026-10-01",
        "note": "Park cleanup",
        "serviceHours": 2,
    }
    blocked = [
        call("add_activity_entry", "lead", entry),
        call("set_media_consent", "lead", {"troopId": tid, "scoutId": sid, "granted": True}),
        call("record_prior_advancement", "lead", {"troopId": tid, "scoutId": sid, "ranks": {"scout": "2026-01-01"}}),
        call(
            "draft_path", "lead", {"troopId": tid, "scoutId": sid, "goalAwardId": "star", "request": "Star by spring"}
        ),
    ]
    for response in blocked:
        assert response.status_code == 400 and WAITING in response.text, response.text
    assert list_docs(f"troops/{tid}/logs") == []
    assert "mediaConsent" not in read(f"troops/{tid}/members/{sid}")
    ok(accept(tid, sid, "mom", MOM["email"]))
    assert "consentHold" not in read(f"troops/{tid}/members/{sid}")
    assert ok(call("add_activity_entry", "lead", entry))["status"] == "approved"


def test_a_link_works_only_for_the_email_it_was_sent_to():
    tid = new_troop("104")
    sid = add_young(tid)
    wrong = accept(tid, sid, "other", MOM["email"])
    assert wrong.status_code == 400 and "different email address" in wrong.text
    assert "consentHold" in read(f"troops/{tid}/members/{sid}")


def test_one_parent_agreeing_gives_consent_and_the_others_stop_being_emailed():
    tid = new_troop("105")
    sid = add_young(tid, [MOM, DAD])
    ok(accept(tid, sid, "dad", DAD["email"]))
    statuses = {p["email"]: p["status"] for p in request_of(tid, sid)["parents"]}
    assert statuses == {"mom@example.test": "noAnswer", "dad@example.test": "agreed"}
    assert read(f"troops/{tid}/consents/{sid}")["parentConsents"][0]["uid"] == "dad"
    assert read(f"troops/{tid}/access/dad")["scoutIds"] == [sid]
    assert len(outbox("consent_confirmation")) == 1  # the follow-up record of what the parent agreed to
    from endpoints.consent_notices import run_notices

    before = len(outbox("consent_request"))
    run_notices(datetime.now(UTC) + timedelta(days=14))
    assert len(outbox("consent_request")) == before  # mom is not reminded
    ok(accept(tid, sid, "mom", MOM["email"]))  # she can still sign in and link as a parent later
    assert read(f"troops/{tid}/access/mom")["scoutIds"] == [sid]


def test_a_parent_who_declines_is_not_linked_and_stops_being_emailed_and_the_other_continues():
    tid = new_troop("106")
    sid = add_young(tid, [MOM, DAD])
    body = {"troopId": tid, "code": code_of(tid, sid, DAD["email"])}
    assert call("decline_consent_request", "other", body).status_code == 403  # not their link
    assert ok(call("decline_consent_request", "dad", body))["removed"] is False
    statuses = {p["email"]: p["status"] for p in request_of(tid, sid)["parents"]}
    assert statuses == {"mom@example.test": "emailed", "dad@example.test": "declined"}
    assert read(f"troops/{tid}/access/dad") is None and "withdrawal" not in (read(f"troops/{tid}/consents/{sid}") or {})
    from endpoints.consent_notices import run_notices

    run_notices(datetime.now(UTC) + timedelta(days=8))
    sent_to = [m["to"] for m in outbox("consent_request")]
    assert sent_to.count("mom@example.test") == 2 and sent_to.count("dad@example.test") == 1  # dad: only the first


def test_if_every_parent_declines_the_waiting_scout_and_the_contact_details_are_deleted():
    tid = new_troop("107")
    sid = add_young(tid, [MOM, DAD])
    ok(call("decline_consent_request", "dad", {"troopId": tid, "code": code_of(tid, sid, DAD["email"])}))
    last = ok(call("decline_consent_request", "mom", {"troopId": tid, "code": code_of(tid, sid, MOM["email"])}))
    assert last["removed"] is True
    assert read(f"troops/{tid}/members/{sid}") is None and request_of(tid, sid) is None
    assert read(f"troops/{tid}/scoutRecords/{sid}") is None
    assert list_docs(f"troops/{tid}/invites") == []


def test_a_leader_can_resend_but_each_parent_gets_one_email_a_week_and_four_in_all():
    tid = new_troop("108")
    sid = add_young(tid)
    args = {"troopId": tid, "scoutId": sid}
    assert ok(call("resend_consent_request", "lead", args)) == {"sent": 0, "tooSoon": 1}
    assert call("resend_consent_request", "mom", args).status_code == 403
    for sent in (2, 3, 4):
        parents = request_of(tid, sid)["parents"]
        owner.set(
            f"troops/{tid}/consentRequests/{sid}",
            {**request_of(tid, sid), "parents": [{**parents[0], "lastSentAt": datetime.now(UTC) - timedelta(days=8)}]},
        )
        assert ok(call("resend_consent_request", "lead", args))["sent"] == 1
        assert request_of(tid, sid)["parents"][0]["sentCount"] == sent
    parents = request_of(tid, sid)["parents"]
    owner.set(
        f"troops/{tid}/consentRequests/{sid}",
        {**request_of(tid, sid), "parents": [{**parents[0], "lastSentAt": datetime.now(UTC) - timedelta(days=8)}]},
    )
    assert ok(call("resend_consent_request", "lead", args))["sent"] == 0  # the fourth email was the last
    assert len(outbox("consent_request")) == 4


def test_a_leader_can_add_a_second_parent_later_and_both_are_listed():
    tid = new_troop("109")
    sid = add_young(tid)
    ok(call("set_consent_parents", "lead", {"troopId": tid, "scoutId": sid, "parents": [DAD]}))
    assert {p["email"] for p in request_of(tid, sid)["parents"]} == {"mom@example.test", "dad@example.test"}
    assert call("set_consent_parents", "mom", {"troopId": tid, "scoutId": sid, "parents": [DAD]}).status_code == 403
    five = [{"name": f"P{i}", "email": f"p{i}@example.test"} for i in range(4)]
    assert call("set_consent_parents", "lead", {"troopId": tid, "scoutId": sid, "parents": five}).status_code == 400


def test_the_daily_job_emails_waiting_parents_weekly_up_to_four_times():
    tid = new_troop("110")
    sid = add_young(tid, [MOM, DAD])
    from endpoints.consent_notices import run_notices

    now = datetime.now(UTC)
    assert run_notices(now + timedelta(hours=2))["requestEmails"] == 0  # the first email already went out
    for week in range(1, 7):
        run_notices(now + timedelta(days=7 * week + 1))
    assert len(outbox("consent_request")) == 8  # two parents, four emails each
    assert {p["status"] for p in request_of(tid, sid)["parents"]} == {"noAnswer"}


def run_retention(later: date):
    os.environ.setdefault("FUNCTIONS_EMULATOR", "true")
    os.environ.setdefault("GCLOUD_PROJECT", "demo-trailhead")
    from endpoints.retention import Budget
    from endpoints.retention import run_retention as run

    return run(later, False, Budget())


def test_after_30_days_without_an_answer_the_waiting_scout_and_contact_details_are_deleted():
    tid = new_troop("111")
    sid = add_young(tid)
    run_retention(date.today() + timedelta(days=29))
    assert read(f"troops/{tid}/members/{sid}") is not None  # still waiting on day 29
    request = request_of(tid, sid)
    owner.set(f"troops/{tid}/consentRequests/{sid}", {**request, "deleteAfter": datetime.now(UTC) - timedelta(hours=1)})
    totals = run_retention(date.today() + timedelta(days=31))
    assert totals["consentRequests"] >= 1
    assert read(f"troops/{tid}/members/{sid}") is None and request_of(tid, sid) is None
    assert list_docs(f"troops/{tid}/invites") == []


def old_scout_with_leader_confirmation_only(tid: str) -> str:
    owner.set(f"troops/{tid}/members/old1", {"kind": "scout", "displayName": "Max", "guardianIds": []})
    owner.set(f"troops/{tid}/scoutRecords/old1", {"birthYear": YOUNG, "birthMonth": 3, "currentRankId": "scout"})
    owner.set(
        f"troops/{tid}/consents/old1", {"leaderConfirmation": {"uid": "lead", "memberId": "m", "at": datetime.now(UTC)}}
    )
    return "old1"


def test_an_older_scout_with_only_a_leader_confirmation_needs_parent_consent_and_nothing_is_deleted():
    tid = new_troop("112")
    sid = old_scout_with_leader_confirmation_only(tid)
    assert ok(call("sync_consent_holds", "lead", {"troopId": tid}))["held"] == 1
    assert read(f"troops/{tid}/members/{sid}")["consentHold"] is True
    entry = {"troopId": tid, "scoutId": sid, "kind": "service", "note": "Hike", "serviceHours": 1}
    assert call("add_activity_entry", "lead", entry).status_code == 400  # new data is blocked
    assert read(f"troops/{tid}/consents/{sid}")["leaderConfirmation"]  # the old records stay as they are
    ok(call("set_consent_parents", "lead", {"troopId": tid, "scoutId": sid, "parents": [MOM]}))
    assert request_of(tid, sid)["deletesScout"] is False
    owner.set(f"troops/{tid}/consentRequests/{sid}", {**request_of(tid, sid), "deleteAfter": datetime.now(UTC) - DAY})
    run_retention(date.today() + timedelta(days=40))
    assert request_of(tid, sid) is None  # the contact details go
    assert read(f"troops/{tid}/members/{sid}")["consentHold"] is True  # the Scout and records stay
    assert read(f"troops/{tid}/scoutRecords/{sid}") is not None


DAY = timedelta(days=1)


def test_a_scout_13_or_older_is_unchanged_and_a_parent_adding_their_own_child_needs_no_email():
    tid = new_troop("113")
    form = {"troopId": tid, "displayName": "Teen", "birthYear": 2010, "birthMonth": 3, "currentRankId": "scout"}
    sid = ok(call("add_scout", "lead", form))["scoutId"]
    assert "consentHold" not in read(f"troops/{tid}/members/{sid}")
    assert ok(call("sync_consent_holds", "lead", {"troopId": tid}))["held"] == 0
    assert list_docs(f"troops/{tid}/consentRequests") == []


def test_data_added_by_a_newer_notice_waits_for_a_parent_who_agreed_to_an_older_one():
    tid = new_troop("114")
    owner.set(f"troops/{tid}/members/s1", {"kind": "scout", "displayName": "Ava", "guardianIds": ["m-mom"]})
    owner.set(f"troops/{tid}/scoutRecords/s1", {"birthYear": 2010, "birthMonth": 3, "currentRankId": "scout"})
    old = {"uid": "mom", "memberId": "m-mom", "at": datetime.now(UTC), "version": "2026-10-16.1"}
    owner.set(f"troops/{tid}/consents/s1", {"parentConsents": [old]})
    owner.set(f"troops/{tid}/access/mom", {"memberId": "m-mom", "roles": ["parent"], "scoutIds": ["s1"]})
    owner.set(f"troops/{tid}/members/m-mom", {"kind": "adult", "displayName": "Mom", "uid": "mom", "roles": ["parent"]})
    entry = {
        "troopId": tid,
        "scoutId": "s1",
        "kind": "service",
        "date": "2026-10-01",
        "note": "Hike",
        "serviceHours": 1,
    }
    blocked = call("add_activity_entry", "lead", entry)  # activity logs were added in 2026-10-17.1
    assert blocked.status_code == 400 and "Waiting for a parent to agree to the updated notice." in blocked.text
    assert list_docs(f"troops/{tid}/logs") == []
    assert call("set_media_consent", "lead", {"troopId": tid, "scoutId": "s1", "granted": True}).status_code == 200
    ok(call("review_consent_notice", "mom", {"troopId": tid, **AGREE}))
    assert ok(call("add_activity_entry", "lead", entry))["status"] == "approved"
