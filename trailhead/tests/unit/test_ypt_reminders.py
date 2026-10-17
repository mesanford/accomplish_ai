"""Youth Protection reminders: the schedule, idempotency, the weekly list and the message text."""

from datetime import UTC, date, datetime

import pytest

from handlers.health_forms import can_record, parse_record
from handlers.membership import InvalidInput
from handlers.ypt_dates import parse_own_date
from handlers.ypt_messages import adult_email, adult_push, weekly_email, weekly_push
from handlers.ypt_reminders import (
    CURRENT,
    EXPIRING,
    LAPSED,
    LAPSED_STATUS,
    MISSING,
    SOON,
    WEEK,
    attention,
    digest_due,
    digest_record,
    needs_ypt,
    plan_member,
    reached,
    status_of,
    week_start,
)

EXPIRES = date(2026, 12, 1)


def test_status_windows():
    assert status_of(None, date(2026, 10, 1)) == MISSING
    assert status_of(EXPIRES, date(2026, 10, 1)) == CURRENT  # 61 days
    assert status_of(EXPIRES, date(2026, 11, 1)) == EXPIRING  # exactly 30 days
    assert status_of(EXPIRES, date(2026, 10, 31)) == CURRENT  # 31 days
    assert status_of(EXPIRES, date(2026, 12, 1)) == EXPIRING  # still valid on the expiry day
    assert status_of(EXPIRES, date(2026, 12, 2)) == LAPSED_STATUS


@pytest.mark.parametrize(
    ("today", "stages"),
    [
        (date(2026, 10, 31), []),  # 31 days out
        (date(2026, 11, 1), [SOON]),  # 30 days out
        (date(2026, 11, 23), [SOON]),  # 8 days out
        (date(2026, 11, 24), [SOON, WEEK]),  # 7 days out
        (date(2026, 12, 1), [SOON, WEEK, LAPSED]),  # the expiry date: the final notice goes out today
        (date(2026, 12, 2), [LAPSED]),  # a day late (catch-up after an outage)
        (date(2026, 12, 15), [LAPSED]),  # 14 days late: still told
        (date(2026, 12, 16), []),  # older lapses are left to the weekly list
    ],
)
def test_stages_reached(today, stages):
    assert reached(EXPIRES, today) == stages


def test_the_thirty_day_reminder_goes_out_once():
    today = date(2026, 11, 1)
    first = plan_member(EXPIRES, today, None)
    assert first.stage == SOON
    assert first.record == {"expiresOn": "2026-12-01", "sent": [SOON]}
    assert plan_member(EXPIRES, today, first.record).stage is None  # a rerun sends nothing
    assert plan_member(EXPIRES, date(2026, 11, 20), first.record).stage is None  # nor on later days


def test_each_stage_sends_once_in_order():
    record = None
    sent = []
    for today in (date(2026, 11, 1), date(2026, 11, 2), date(2026, 11, 24), date(2026, 11, 25), date(2026, 12, 2)):
        plan = plan_member(EXPIRES, today, record)
        if plan.stage:
            sent.append((today.isoformat(), plan.stage))
            record = plan.record
    assert sent == [("2026-11-01", SOON), ("2026-11-24", WEEK), ("2026-12-02", LAPSED)]


def test_someone_first_seen_late_gets_one_reminder_and_earlier_ones_are_marked_sent():
    plan = plan_member(EXPIRES, date(2026, 11, 28), None)  # 3 days left
    assert plan.stage == WEEK
    assert plan.record["sent"] == [SOON, WEEK]
    assert plan_member(EXPIRES, date(2026, 11, 29), plan.record).stage is None


def test_renewing_starts_a_fresh_set_of_reminders():
    record = plan_member(EXPIRES, date(2026, 11, 1), None).record
    renewed = date(2027, 12, 1)
    assert plan_member(renewed, date(2026, 11, 1), record).stage is None  # far away
    assert plan_member(renewed, date(2027, 11, 1), record).stage == SOON  # the old record does not block it


def test_no_date_or_a_far_date_plans_nothing():
    assert plan_member(None, date(2026, 11, 1), None).stage is None
    assert plan_member(EXPIRES, date(2026, 6, 1), None).record is None
    assert plan_member(EXPIRES, date(2030, 1, 1), None).stage is None  # lapsed years ago: no email


def test_the_weekly_list_goes_out_once_per_week():
    monday = date(2026, 10, 12)
    assert week_start(date(2026, 10, 18)) == monday
    assert digest_due(monday, None)
    record = digest_record(monday)
    assert not digest_due(date(2026, 10, 14), record)
    assert not digest_due(date(2026, 10, 18), record)
    assert digest_due(date(2026, 10, 19), record)


def adult(name, roles, ypt, **more):
    return {"kind": "adult", "displayName": name, "roles": roles, "yptExpiresAt": ypt, **more}


def test_only_adults_with_a_trained_role_need_training():
    assert needs_ypt(adult("A", ["leader"], None))
    assert needs_ypt(adult("A", ["parent", "counselor"], None))
    assert not needs_ypt(adult("A", ["parent"], None))
    assert not needs_ypt(adult("A", ["treasurer"], None))
    assert not needs_ypt({"kind": "scout", "roles": ["scout", "leader"]})  # a Scout is never reminded
    assert not needs_ypt(adult("A", ["leader"], None, leftAt=datetime(2026, 1, 1, tzinfo=UTC)))
    assert needs_ypt({"kind": "adult"}, ["committee"])  # roles from the login when the member has none


def test_attention_lists_lapsed_missing_and_expiring_adults_most_urgent_first():
    today = date(2026, 11, 10)
    members = {
        "ok": adult("Okay", ["leader"], datetime(2027, 6, 1, 23, 59, tzinfo=UTC)),
        "soon": adult("Soon", ["leader"], datetime(2026, 11, 30, 23, 59, tzinfo=UTC)),
        "late": adult("Late", ["counselor"], datetime(2026, 10, 1, 23, 59, tzinfo=UTC)),
        "none": adult("None", ["committee"], None),
        "mom": adult("Mom", ["parent"], None),
        "kid": {"kind": "scout", "displayName": "Kid", "roles": ["scout"]},
    }
    rows = attention(members, today)
    assert [(r["name"], r["status"]) for r in rows] == [("None", MISSING), ("Late", LAPSED_STATUS), ("Soon", EXPIRING)]


def test_adult_emails_name_the_date_and_link_to_the_account_page():
    for stage in (SOON, WEEK, LAPSED):
        mail = adult_email(stage, EXPIRES, date(2026, 11, 1), "t1", "https://app.test")
        assert "Dec 1, 2026" in mail.text and "Update your date in Forthright: https://app.test/account" in mail.text
        assert "Youth Protection" in mail.subject and "ask a troop leader" not in mail.text.lower()
    assert "in 30 days" in adult_email(SOON, EXPIRES, date(2026, 11, 1), "t1", "https://app.test").text


def test_the_final_notice_says_expires_today_on_the_expiry_date_and_expired_after():
    today = adult_email(LAPSED, EXPIRES, EXPIRES, "t1", "https://app.test")
    assert today.subject == "Your Youth Protection training expires today"
    assert "expires today" in today.text
    late = adult_email(LAPSED, EXPIRES, date(2026, 12, 3), "t1", "https://app.test")
    assert late.subject == "Your Youth Protection training has expired" and "expired on Dec 1, 2026" in late.text


def test_an_adult_may_enter_a_date_from_today_to_three_years_ahead():
    today = date(2026, 10, 17)
    assert parse_own_date("2026-10-17", today) == datetime(2026, 10, 17, 23, 59, tzinfo=UTC)
    assert parse_own_date("2029-10-17", today).year == 2029
    for bad in ("2026-10-16", "2029-10-18", "soon", "", None, 20271001, "2027-02-30"):
        with pytest.raises(InvalidInput):
            parse_own_date(bad, today)


def test_pushes_carry_no_name_and_no_date():
    for stage in (SOON, WEEK, LAPSED):
        shown = adult_push(stage, "t1")
        assert "2026" not in shown.body and shown.path == "/account"
    note = weekly_push(3, "t1")
    assert note.body == "3 adults need to renew training." and note.path == "/t/t1/roster"
    assert weekly_push(1, "t1").body == "1 adult needs to renew training."


def test_the_weekly_email_lists_adults_and_caps_the_list():
    rows = [{"name": f"Adult {i}", "status": LAPSED_STATUS, "expires": date(2026, 10, 1)} for i in range(60)]
    rows.insert(0, {"name": "No Date", "status": MISSING, "expires": None})
    mail = weekly_email(rows, "t1", "https://app.test")
    assert "No Date: no date on file" in mail.text and "Adult 0: lapsed Oct 1, 2026" in mail.text
    assert "And 11 more" in mail.text
    assert mail.subject == "61 adults need Youth Protection training"


def test_who_may_record_a_health_form_date():
    leader = {"memberId": "m-l", "roles": ["leader"], "scoutIds": []}
    parent = {"memberId": "m-p", "roles": ["parent"], "scoutIds": ["s1"], "consentPendingScoutIds": ["s2"]}
    scout = {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]}
    assert can_record(leader, "anyone")
    assert can_record(parent, "s1") and can_record(parent, "m-p")
    assert not can_record(parent, "s2")  # a link the parent has not agreed to yet
    assert not can_record(parent, "s3") and not can_record(parent, "m-l")
    assert can_record(scout, "s1") and not can_record(scout, "s9")


def test_a_health_form_request_needs_a_part_and_a_real_date_that_is_not_in_the_future():
    today = date(2026, 10, 17)
    assert parse_record({"part": "partsAB", "date": "2026-10-17"}, today) == ("partsAB", "2026-10-17")
    assert parse_record({"part": "partC", "date": "2026-10-18"}, today)[1] == "2026-10-18"  # time zone slack
    for bad in (
        {"part": "partD", "date": "2026-10-01"},
        {"part": "partC"},
        {"part": "partC", "date": "10/01/2026"},
        {"part": "partC", "date": "2026-02-30"},
        {"part": "partC", "date": "2026-10-19"},
        {"part": "partC", "date": "1999-12-31"},
        {"part": "partC", "date": 20261001},
    ):
        with pytest.raises(InvalidInput):
            parse_record(bad, today)
