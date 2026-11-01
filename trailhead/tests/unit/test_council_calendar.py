from datetime import date

import pytest

from handlers import council_calendar as cc
from handlers.membership import InvalidInput

TODAY = date(2026, 10, 31)
FEED = "\r\n".join(
    [
        "BEGIN:VCALENDAR",
        "X-WR-TIMEZONE:America/Chicago",
        "BEGIN:VEVENT",
        "SUMMARY:Fall Camporee\\, all troops",
        "DTSTART;VALUE=DATE:20261113",
        "DTEND;VALUE=DATE:20261116",
        "LOCATION:Camp Rokilio",
        "URL:https://scoutingevent.com/635-camporee",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "SUMMARY:Roundtable",
        "DTSTART;TZID=America/Chicago:20261105T190000",
        "DTEND;TZID=America/Chicago:20261105T203000",
        "RRULE:FREQ=MONTHLY;BYDAY=1TH",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "SUMMARY:Late UTC event",
        "DTSTART:20261121T030000Z",  # 9 pm on Nov 20 in Chicago
        "END:VEVENT",
        "BEGIN:VEVENT",
        "SUMMARY:Last year",
        "DTSTART;VALUE=DATE:20251010",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "SUMMARY:Called off",
        "STATUS:CANCELLED",
        "DTSTART;VALUE=DATE:20261201",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "SUMMARY:Merit Badge Universi",
        " ty",  # a folded line
        "DTSTART;VALUE=DATE:20270123",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
)


def test_upcoming_events_are_read_with_their_days():
    events = cc.parse(FEED, TODAY)
    assert [e["title"] for e in events] == [
        "Roundtable",
        "Fall Camporee, all troops",
        "Late UTC event",
        "Merit Badge University",
    ]
    camporee = events[1]
    assert (camporee["start"], camporee["end"], camporee["place"]) == ("2026-11-13", "2026-11-15", "Camp Rokilio")
    assert camporee["url"].startswith("https://") and events[0]["repeats"] is True
    assert events[2]["start"] == "2026-11-20"  # a UTC time is shown on the feed's own day


def test_a_web_page_is_not_a_feed():
    with pytest.raises(InvalidInput, match="isn't a calendar feed"):
        cc.parse("<!doctype html><html>Calendar</html>", TODAY)


def test_feed_links_are_https_and_webcal_is_the_same_address():
    assert cc.feed_url(" webcal://scoutingevent.com/cal.ics ") == "https://scoutingevent.com/cal.ics"
    for bad in ("http://example.org/cal.ics", "ftp://x/y", "https://user:pw@example.org/c.ics", "", None, "x" * 501):
        with pytest.raises(InvalidInput):
            cc.feed_url(bad)


def test_troops_in_the_same_council_match_whatever_they_typed():
    assert cc.council_key("Bay-Lakes Council, BSA") == cc.council_key("Bay Lakes") == "bay-lakes"
    assert cc.council_key("Council") is None and cc.council_key(None) is None
