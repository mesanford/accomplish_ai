from datetime import UTC, date, datetime, timedelta

import pytest

from handlers.consent import CONSENT_NOTICE_VERSION
from handlers.consent_requests import (
    AGREED,
    DECLINED,
    EMAILED,
    NO_ANSWER,
    clean_parents,
    email_due,
    expired,
    gave_up,
    needs_parent_consent,
    new_parent,
    new_request,
    outcome,
    settle,
    to_email,
    with_status,
)
from handlers.consent_review import next_reminder_record, reminder_due
from handlers.email_templates import consent_request, consent_review_reminder
from handlers.membership import InvalidInput

TODAY = date(2026, 10, 17)
NOW = datetime(2026, 10, 17, 9, tzinfo=UTC)
DAY = timedelta(days=1)


def test_only_a_parent_can_consent_for_a_scout_under_13_or_of_unknown_age():
    assert needs_parent_consent({"birthYear": 2015, "birthMonth": 3}, TODAY)
    assert needs_parent_consent({"birthYear": 2013, "birthMonth": 10}, TODAY)  # turns 13 this month: assume younger
    assert not needs_parent_consent({"birthYear": 2013, "birthMonth": 9}, TODAY)
    assert not needs_parent_consent({"birthYear": 2010, "birthMonth": 3}, TODAY)
    for unknown in (None, {}, {"birthYear": 2010}, {"birthMonth": 3}, {"birthYear": "2010", "birthMonth": 3}):
        assert needs_parent_consent(unknown, TODAY)


def test_parents_need_a_name_and_a_distinct_valid_email():
    assert clean_parents([{"name": " Pat ", "email": " Pat@Example.TEST "}]) == [
        {"name": "Pat", "email": "pat@example.test"}
    ]
    assert len(clean_parents([{"name": "A", "email": "a@x.org"}, {"name": "B", "email": "b@x.org"}])) == 2
    for bad in (None, [], "x", [{"name": "", "email": "a@x.org"}], [{"name": "A", "email": "nope"}], [{"name": "A"}]):
        with pytest.raises(InvalidInput):
            clean_parents(bad)
    with pytest.raises(InvalidInput, match="own email"):
        clean_parents([{"name": "A", "email": "a@x.org"}, {"name": "B", "email": "A@x.org"}])
    with pytest.raises(InvalidInput, match="at most"):
        clean_parents([{"name": str(i), "email": f"{i}@x.org"} for i in range(5)])


def test_the_email_schedule_is_at_once_then_weekly_and_four_in_all():
    assert email_due(0, None, NOW)
    assert not email_due(1, NOW - 6 * DAY, NOW)
    assert email_due(1, NOW - 7 * DAY, NOW)
    assert email_due(3, NOW - 7 * DAY, NOW)
    assert not email_due(4, NOW - 30 * DAY, NOW)  # the cap
    assert not gave_up(4, NOW - 6 * DAY, NOW) and gave_up(4, NOW - 7 * DAY, NOW)


def request_with(*statuses, sent=0, last=None) -> dict:
    parents = [
        {
            **new_parent(f"P{i}", f"p{i}@x.org", f"code{i}"),
            "pid": f"p{i}",
            "status": s,
            "sentCount": sent,
            "lastSentAt": last,
        }
        for i, s in enumerate(statuses)
    ]
    return new_request(parents, NOW, "consent", True)


def test_a_new_request_emails_everyone_listed_then_weekly_until_four():
    request = request_with(EMAILED, EMAILED)
    assert to_email(request, NOW) == ["p0", "p1"]
    sent_once = request_with(EMAILED, EMAILED, sent=1, last=NOW)
    assert to_email(sent_once, NOW + 6 * DAY) == []
    assert to_email(sent_once, NOW + 7 * DAY) == ["p0", "p1"]
    capped = request_with(EMAILED, sent=4, last=NOW)
    assert to_email(capped, NOW + 30 * DAY) == []
    assert settle(capped, NOW + 7 * DAY)["parents"][0]["status"] == NO_ANSWER  # four emails, no answer


def test_when_one_parent_agrees_the_others_stop_and_the_scout_has_consent():
    request = with_status(request_with(EMAILED, EMAILED, EMAILED), "p1", AGREED)
    assert outcome(request) == AGREED
    assert to_email(request, NOW + 30 * DAY) == []
    assert [p["status"] for p in settle(request, NOW)["parents"]] == [NO_ANSWER, AGREED, NO_ANSWER]


def test_a_parent_who_declines_stops_being_emailed_but_the_others_continue():
    request = with_status(request_with(EMAILED, EMAILED), "p0", DECLINED)
    assert outcome(request) == "waiting"
    assert to_email(request, NOW) == ["p1"]


def test_if_every_parent_declines_the_outcome_is_declined():
    request = with_status(with_status(request_with(EMAILED, EMAILED), "p0", DECLINED), "p1", DECLINED)
    assert outcome(request) == DECLINED
    assert to_email(request, NOW) == []
    assert outcome(None) == "waiting" and outcome({"parents": []}) == "waiting"


def test_a_request_expires_after_30_days_and_a_declined_all_request_does_not_wait():
    request = request_with(EMAILED)
    assert not expired(request, NOW + 29 * DAY) and expired(request, NOW + 30 * DAY)
    assert not expired(None, NOW)


def test_a_review_reminder_is_due_at_once_weekly_and_four_per_version_then_starts_over():
    version = CONSENT_NOTICE_VERSION
    record = None
    sent = []
    for day in range(0, 60):
        now = NOW + day * DAY
        if reminder_due(record, version, now):
            record = next_reminder_record(record, version, now)
            sent.append(day)
    assert sent == [0, 7, 14, 21]  # once, then weekly, four in all
    assert reminder_due(record, "2026-12-01.1", NOW + 60 * DAY)  # a new version starts the count again
    assert next_reminder_record(record, "2026-12-01.1", NOW)["count"] == 1


def test_a_parent_who_turned_notifications_off_still_gets_the_email_with_a_note():
    note = "even though you turned off notification emails, because it's about your consent for Ava's information"
    plain = consent_request("Ava", "Pat", "Troop 9", "https://app.test/join/t/c", "https://app.test")
    off = consent_request("Ava", "Pat", "Troop 9", "https://app.test/join/t/c", "https://app.test", opted_out=True)
    assert note not in plain.text and note in off.text and note in off.html.replace("&#x27;", "'")
    assert "30 days" in off.text and "https://app.test/join/t/c" in off.text
    review = consent_review_reminder(["Ava"], "Troop 9", "t", "https://app.test", opted_out=True)
    assert note in review.text and "https://app.test/t/t" in review.text
    assert note not in consent_review_reminder(["Ava"], "Troop 9", "t", "https://app.test").text


def test_the_request_email_names_only_first_names_and_marks_a_reminder():
    mail = consent_request("Ava", "Pat", "Troop 9", "https://x/j", "https://x", reminder=True)
    assert mail.subject.startswith("Reminder: ") and "Jones" not in mail.text
