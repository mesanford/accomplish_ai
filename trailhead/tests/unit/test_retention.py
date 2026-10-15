"""The retention schedule: what is due for deletion on a given day."""

from datetime import UTC, date, datetime, timedelta

import pytest

from handlers.retention import (
    TIMEZONE,
    add_months,
    adult_from,
    dry_run,
    is_due,
    lead_due,
    local_date,
    plan_scouts,
    plan_usage,
    query_cutoff,
    scout_due,
    thread_due,
    troop_due,
    troop_last_active,
    usage_day,
)


def at(y, m, d, hour=12) -> datetime:
    """A Firestore-style aware timestamp, noon US Central unless told otherwise."""
    return datetime(y, m, d, hour, tzinfo=TIMEZONE)


SCOUT = {"kind": "scout"}


@pytest.mark.parametrize(
    ("start", "months", "expected"),
    [
        (date(2026, 1, 15), 12, date(2027, 1, 15)),
        (date(2026, 11, 30), 2, date(2027, 1, 30)),
        (date(2026, 1, 31), 1, date(2026, 3, 1)),  # no 31 February: the 1st of March, never 28 February
        (date(2026, 3, 31), 1, date(2026, 5, 1)),  # no 31 April
        (date(2024, 2, 29), 12, date(2025, 3, 1)),  # leap day, a year on: 1 March
        (date(2024, 2, 29), 48, date(2028, 2, 29)),  # leap year to leap year
        (date(2026, 12, 31), 2, date(2027, 3, 1)),  # 31 Feb 2027 is missing: 1 March 2027
        (date(2026, 12, 15), 1, date(2027, 1, 15)),  # across a year end
        (date(2026, 3, 15), -24, date(2024, 3, 15)),
        (date(2026, 1, 10), -1, date(2025, 12, 10)),
    ],
)
def test_add_months(start, months, expected):
    assert add_months(start, months) == expected


def test_due_on_the_day_and_after_but_not_before():
    assert not is_due(date(2025, 10, 14), 12, date(2026, 10, 13))
    assert is_due(date(2025, 10, 14), 12, date(2026, 10, 14))
    assert is_due(date(2025, 10, 14), 12, date(2027, 1, 1))
    assert not is_due(None, 12, date(2030, 1, 1))


def test_local_date_uses_us_central_time():
    # 03:00 UTC on 1 March is still 28 February in Chicago.
    assert local_date(datetime(2026, 3, 1, 3, tzinfo=UTC)) == date(2026, 2, 28)
    assert local_date(datetime(2026, 3, 1, 3)) == date(2026, 2, 28)  # a naive timestamp is UTC
    assert local_date(date(2026, 3, 1)) == date(2026, 3, 1)
    for unknown in (None, "2026-03-01", 1700000000, {}):
        assert local_date(unknown) is None


class TestAge:
    today = date(2026, 10, 14)

    def test_eighteen_from_the_first_of_the_month_after_the_birthday_month(self):
        assert adult_from({"birthYear": 2008, "birthMonth": 3}, self.today) == date(2026, 4, 1)
        assert adult_from({"birthYear": 2008, "birthMonth": 12}, self.today) == date(2027, 1, 1)
        assert adult_from({"birthYear": 2008, "birthMonth": 2}, self.today) == date(2026, 3, 1)

    @pytest.mark.parametrize(
        "record",
        [
            None,
            {},
            {"birthYear": 2008},
            {"birthMonth": 3},
            {"birthYear": "2008", "birthMonth": 3},
            {"birthYear": 2008, "birthMonth": 3.0},
            {"birthYear": 2008, "birthMonth": 0},
            {"birthYear": 2008, "birthMonth": 13},
            {"birthYear": True, "birthMonth": 3},
            {"birthYear": 2008, "birthMonth": True},
            {"birthYear": 1800, "birthMonth": 3},
            {"birthYear": 2099, "birthMonth": 3},
            {"birthYear": None, "birthMonth": None},
        ],
    )
    def test_missing_or_bad_birth_data_is_never_deleted_by_age(self, record):
        assert adult_from(record, self.today) is None
        assert scout_due(SCOUT, record, date(2100, 1, 1)) is None

    def test_records_go_twelve_months_after_turning_eighteen(self):
        record = {"birthYear": 2007, "birthMonth": 9}  # 18 from 1 October 2025
        assert scout_due(SCOUT, record, date(2026, 9, 30)) is None
        assert scout_due(SCOUT, record, date(2026, 10, 1)) == "age"

    def test_december_birthday_rolls_into_the_next_year(self):
        record = {"birthYear": 2007, "birthMonth": 12}  # 18 from 1 January 2026
        assert scout_due(SCOUT, record, date(2026, 12, 31)) is None
        assert scout_due(SCOUT, record, date(2027, 1, 1)) == "age"

    def test_february_birthday_in_a_leap_year(self):
        record = {"birthYear": 2008, "birthMonth": 2}  # could be born 29 Feb 2008; 18 from 1 March 2026
        assert scout_due(SCOUT, record, date(2027, 2, 28)) is None
        assert scout_due(SCOUT, record, date(2027, 3, 1)) == "age"

    def test_a_younger_scout_is_not_due(self):
        assert scout_due(SCOUT, {"birthYear": 2012, "birthMonth": 5}, self.today) is None


class TestLeft:
    def test_twelve_months_after_leaving(self):
        member = {**SCOUT, "leftAt": at(2025, 10, 14)}
        assert scout_due(member, {"birthYear": 2012, "birthMonth": 5}, date(2026, 10, 13)) is None
        assert scout_due(member, {"birthYear": 2012, "birthMonth": 5}, date(2026, 10, 14)) == "left"

    def test_left_on_a_leap_day(self):
        member = {**SCOUT, "leftAt": at(2024, 2, 29)}
        assert scout_due(member, None, date(2025, 2, 28)) is None
        assert scout_due(member, None, date(2025, 3, 1)) == "left"

    def test_left_late_in_the_evening_counts_by_the_central_time_date(self):
        member = {**SCOUT, "leftAt": datetime(2025, 11, 1, 2, tzinfo=UTC)}  # 31 October, 21:00 in Chicago
        assert scout_due(member, None, date(2026, 10, 31)) == "left"

    def test_whichever_comes_first(self):
        record = {"birthYear": 2007, "birthMonth": 9}  # age-due 1 October 2026
        member = {**SCOUT, "leftAt": at(2026, 3, 1)}  # left-due 1 March 2027
        assert scout_due(member, record, date(2026, 10, 1)) == "age"
        early = {**SCOUT, "leftAt": at(2025, 1, 1)}  # left-due 1 January 2026
        assert scout_due(early, record, date(2026, 10, 1)) == "left"

    def test_left_without_birth_data_still_counts(self):
        assert scout_due({**SCOUT, "leftAt": at(2024, 1, 1)}, None, date(2026, 10, 14)) == "left"

    def test_unreadable_left_date_is_ignored(self):
        assert scout_due({**SCOUT, "leftAt": "2020-01-01"}, None, date(2026, 10, 14)) is None

    def test_only_scouts(self):
        assert scout_due({"kind": "adult", "leftAt": at(2020, 1, 1)}, None, date(2026, 10, 14)) is None
        assert scout_due({}, {"birthYear": 1990, "birthMonth": 1}, date(2026, 10, 14)) is None


def test_plan_scouts_in_id_order_with_reasons():
    members = {"b": {**SCOUT, "leftAt": at(2024, 1, 1)}, "a": SCOUT, "c": SCOUT, "d": {"kind": "adult"}}
    records = {"a": {"birthYear": 2000, "birthMonth": 1}, "c": {"birthYear": 2012, "birthMonth": 1}}
    assert plan_scouts(members, records, date(2026, 10, 14)) == [("a", "age"), ("b", "left")]


class TestThreads:
    today = date(2026, 10, 14)

    def test_twenty_four_months_after_the_last_message(self):
        thread = {"updatedAt": at(2024, 10, 14)}
        assert thread_due(thread, at(2024, 10, 14), self.today)
        assert not thread_due({"updatedAt": at(2024, 10, 15)}, at(2024, 10, 15), self.today)

    def test_a_newer_message_keeps_the_thread(self):
        assert not thread_due({"updatedAt": at(2023, 1, 1)}, at(2026, 1, 1), self.today)

    def test_unknown_dates_are_kept(self):
        assert not thread_due({}, None, self.today)
        assert thread_due({"createdAt": at(2020, 1, 1)}, None, self.today)
        assert thread_due({}, at(2020, 1, 1), self.today)


def test_leads_go_twelve_months_after_they_were_sent():
    assert lead_due({"createdAt": at(2025, 10, 14)}, date(2026, 10, 14))
    assert not lead_due({"createdAt": at(2025, 10, 15)}, date(2026, 10, 14))
    assert not lead_due({}, date(2030, 1, 1))


def test_usage_counters_go_after_thirty_days():
    assert usage_day("uid123_2026-09-14") == date(2026, 9, 14)
    assert usage_day("about_uid123_2026-09-14") == date(2026, 9, 14)
    assert usage_day("leads_2026-09-14") == date(2026, 9, 14)
    assert usage_day("strange") is None
    ids = ["u_2026-09-13", "u_2026-09-14", "about_u_2026-09-01", "leads_2026-10-14", "odd"]
    today = date(2026, 10, 14)  # 13 September is 31 days ago; 14 September is exactly 30
    assert plan_usage(ids, today, 10) == ["about_u_2026-09-01", "u_2026-09-13"]
    assert plan_usage(ids, today, 1) == ["about_u_2026-09-01"]


class TestTroops:
    today = date(2026, 10, 14)

    def test_eighteen_months_after_last_activity(self):
        assert troop_due({"lastActiveAt": at(2025, 4, 14)}, self.today)
        assert not troop_due({"lastActiveAt": at(2025, 4, 15)}, self.today)

    def test_the_later_of_activity_and_tracking_start(self):
        doc = {"lastActiveAt": at(2020, 1, 1), "activityTrackedSince": at(2026, 1, 1)}
        assert troop_last_active(doc) == date(2026, 1, 1)
        assert not troop_due(doc, self.today)

    def test_a_troop_with_no_dates_is_never_due(self):
        assert troop_last_active({"createdAt": at(2010, 1, 1)}) is None
        assert not troop_due({"createdAt": at(2010, 1, 1)}, date(2100, 1, 1))


def test_query_cutoff_never_leaves_out_a_due_document():
    today = date(2026, 3, 1)
    for months in (1, 12, 18, 24):
        cutoff = query_cutoff(today, months)
        day = date(2019, 1, 1)
        while day < today:
            if is_due(day, months, today):
                assert datetime(day.year, day.month, day.day, 23, 59, tzinfo=TIMEZONE) < cutoff, (day, months)
            day += timedelta(days=1)


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, True), ("", True), ("1", True), ("true", True), ("yes", True), ("maybe", True)]
    + [("0", False), ("false", False), ("FALSE", False), (" off ", False), ("no", False)],
)
def test_dry_run_is_on_unless_turned_off(value, expected):
    assert dry_run(value) is expected
