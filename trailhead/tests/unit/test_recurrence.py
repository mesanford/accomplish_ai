"""Repeating events: the dates, the label and the request checks."""

from datetime import date

import pytest

from handlers import recurrence as r
from handlers.membership import InvalidInput

TUE = date(2026, 10, 27)  # the 4th Tuesday of October


def test_weekly_and_every_other_week():
    assert r.dates_for(r.WEEKLY, TUE, date(2026, 11, 17)) == [
        date(2026, 10, 27),
        date(2026, 11, 3),
        date(2026, 11, 10),
        date(2026, 11, 17),
    ]
    assert r.dates_for(r.BIWEEKLY, TUE, date(2026, 11, 23)) == [date(2026, 10, 27), date(2026, 11, 10)]


def test_monthly_keeps_the_same_weekday_of_the_month():
    second_tuesday = date(2026, 10, 13)
    assert r.dates_for(r.MONTHLY, second_tuesday, date(2027, 1, 31)) == [
        date(2026, 10, 13),
        date(2026, 11, 10),
        date(2026, 12, 8),
        date(2027, 1, 12),
    ]


def test_monthly_skips_a_month_without_a_fifth_weekday():
    fifth_thursday = date(2026, 10, 29)
    assert r.dates_for(r.MONTHLY, fifth_thursday, date(2027, 1, 31)) == [date(2026, 10, 29), date(2026, 12, 31)]


def test_labels():
    assert r.label(r.WEEKLY, TUE) == "Every Tuesday"
    assert r.label(r.BIWEEKLY, TUE) == "Every other Tuesday"
    assert r.label(r.MONTHLY, date(2026, 10, 13)) == "The 2nd Tuesday of each month"


@pytest.mark.parametrize(
    ("pattern", "until", "message"),
    [
        ("daily", date(2026, 11, 1), "how often"),
        (r.WEEKLY, date(2026, 10, 1), "can not be before"),
        (r.WEEKLY, date(2027, 12, 1), "up to a year"),
    ],
)
def test_requests_that_can_not_be_met(pattern, until, message):
    with pytest.raises(InvalidInput, match=message):
        r.dates_for(pattern, TUE, until)


def test_a_year_of_weekly_meetings_fits_and_the_cap_is_52():
    assert len(r.dates_for(r.WEEKLY, TUE, date(2027, 10, 19))) == 52
    with pytest.raises(InvalidInput, match="up to 52"):
        r.dates_for(r.WEEKLY, TUE, date(2027, 10, 27))


def test_details_check_the_name_place_and_times():
    assert r.details({"title": " Meeting ", "place": "Hall", "startTime": "19:00", "endTime": "20:30"}) == {
        "title": "Meeting",
        "place": "Hall",
        "startTime": "19:00",
        "endTime": "20:30",
        "public": False,
    }
    with pytest.raises(InvalidInput, match="name"):
        r.details({"title": "  "})
    with pytest.raises(InvalidInput, match="as a time"):
        r.details({"title": "M", "startTime": "7pm"})
    with pytest.raises(InvalidInput, match="after the start"):
        r.details({"title": "M", "startTime": "19:00", "endTime": "18:00"})


def test_a_partial_update_returns_only_what_was_sent():
    assert r.details({"place": ""}, partial=True) == {"place": ""}
    assert r.details({"startTime": "19:30"}, partial=True) == {"startTime": "19:30"}
    assert r.details({"startTime": ""}, partial=True) == {"startTime": None}


def test_request():
    assert r.request({"start": "2026-10-27", "until": "2026-11-17", "pattern": "weekly"}) == (
        "weekly",
        TUE,
        date(2026, 11, 17),
    )
    with pytest.raises(InvalidInput, match="last date"):
        r.request({"start": "2026-10-27", "pattern": "weekly"})
