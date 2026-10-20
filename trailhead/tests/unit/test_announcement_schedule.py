"""Scheduling an announcement: when it may be sent, and what is kept until then."""

from datetime import UTC, datetime, timedelta

import pytest

from handlers import announcement_schedule as s
from handlers.membership import InvalidInput

NOW = datetime(2026, 10, 20, 15, 0, tzinfo=UTC)


def test_a_time_with_its_offset_is_read_as_utc():
    assert s.parse_send_at("2026-10-21T19:00:00-05:00", NOW) == datetime(2026, 10, 22, 0, 0, tzinfo=UTC)
    assert s.parse_send_at("2026-10-21T00:00:00.000Z", NOW) == datetime(2026, 10, 21, tzinfo=UTC)


@pytest.mark.parametrize(
    ("value", "message"),
    [
        (None, "when to send"),
        ("tomorrow", "when to send"),
        ("2026-10-21T19:00:00", "when to send"),  # no offset: ambiguous
        ((NOW + timedelta(minutes=2)).isoformat(), "5 minutes"),
        ((NOW + timedelta(days=61)).isoformat(), "60 days"),
    ],
)
def test_times_that_are_refused(value, message):
    with pytest.raises(InvalidInput, match=message):
        s.parse_send_at(value, NOW)


def test_only_the_post_fields_are_kept():
    data = {"troopId": "t1", "title": "Hi", "audience": {"type": "troop"}, "email": True, "sendAt": "x", "other": 1}
    assert s.request_of(data) == {"title": "Hi", "audience": {"type": "troop"}, "email": True}


def test_due():
    assert s.due({"status": s.SCHEDULED, "sendAt": NOW}, NOW)
    assert not s.due({"status": s.SCHEDULED, "sendAt": NOW + timedelta(minutes=1)}, NOW)
    assert not s.due({"status": s.SENT, "sendAt": NOW}, NOW)
