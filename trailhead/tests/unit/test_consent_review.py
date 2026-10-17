from datetime import UTC, datetime, timedelta

from handlers.consent import CONSENT_NOTICE_VERSION
from handlers.consent_review import (
    is_older,
    latest_versions,
    out_of_date_parents,
    reminder_due,
    version_key,
)
from handlers.email_templates import consent_review_reminder

OLD, OLDER = "2026-10-16.1", "2026-10-15.3"
NOW = datetime(2026, 10, 20, 12, tzinfo=UTC)


def entry(member_id: str, version: str | None) -> dict:
    return {"uid": f"u-{member_id}", "memberId": member_id, "at": NOW, "version": version}


def test_versions_sort_by_date_then_by_number_of_the_day():
    assert version_key("2026-10-17.1") == ("2026-10-17", 1)
    assert is_older("2026-10-15", "2026-10-15.2")
    assert is_older("2026-10-15.9", "2026-10-15.10")  # numbers, not text
    assert is_older("2026-10-16.1", "2026-10-17.1")
    assert not is_older("2026-10-17.1", "2026-10-17.1")
    assert is_older(None, "2026-10-15") and is_older("", "2026-10-15")  # no version recorded is the oldest


def test_a_parents_latest_consent_is_their_highest_version():
    entries = [entry("mom", OLDER), entry("mom", CONSENT_NOTICE_VERSION), entry("dad", OLD)]
    assert latest_versions(entries) == {"mom": CONSENT_NOTICE_VERSION, "dad": OLD}
    assert latest_versions(None) == {}
    assert latest_versions([{"uid": "x"}]) == {}


def test_parents_with_an_older_latest_consent_are_out_of_date():
    consent = {"parentConsents": [entry("mom", OLD), entry("dad", CONSENT_NOTICE_VERSION), entry("gone", OLD)]}
    assert out_of_date_parents(consent, ["mom", "dad"]) == ["mom"]  # "gone" is no longer this Scout's parent


def test_agreeing_again_brings_a_parent_up_to_date():
    consent = {"parentConsents": [entry("mom", OLD)]}
    assert out_of_date_parents(consent, ["mom"]) == ["mom"]
    consent["parentConsents"].append(entry("mom", CONSENT_NOTICE_VERSION))  # append-only: the old entry stays
    assert out_of_date_parents(consent, ["mom"]) == []


def test_a_consent_with_no_recorded_version_is_out_of_date():
    assert out_of_date_parents({"parentConsents": [entry("mom", None)]}, ["mom"]) == ["mom"]


def test_nobody_is_listed_without_a_consent_or_after_a_withdrawal():
    assert out_of_date_parents(None, ["mom"]) == []
    assert out_of_date_parents({}, ["mom"]) == []
    assert out_of_date_parents({"parentConsents": []}, ["mom"]) == []
    withdrawn = {"parentConsents": [entry("mom", OLD)], "withdrawal": {"uid": "u-mom", "memberId": "mom", "at": NOW}}
    assert out_of_date_parents(withdrawn, ["mom"]) == []


def test_a_reminder_goes_at_most_once_every_seven_days():
    assert reminder_due(None, NOW)
    assert not reminder_due(NOW - timedelta(days=6, hours=23), NOW)
    assert reminder_due(NOW - timedelta(days=7), NOW)


def test_the_reminder_email_names_only_first_names_and_links_to_the_troop():
    email = consent_review_reminder(["Riley", "Sam"], "Troop 9", "tn", "https://app.example")
    assert email.subject == "Forthright's notice for Riley and Sam changed"
    assert "https://app.example/t/tn" in email.text and "turn these emails off" in email.text
