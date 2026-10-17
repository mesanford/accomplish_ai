"""The calendar feeds: valid RFC 5545 text, escaping, folding, time zones and what the feeds leave out."""

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from handlers import ics
from handlers.calendar_feed import member_entries, new_token, parse_path, public_entries

STAMP = datetime(2026, 10, 10, 15, 0, tzinfo=UTC)
CHICAGO = ZoneInfo("America/Chicago")
URL = "https://example.web.app"


def unfold(text: str) -> list[str]:
    assert text.endswith("\r\n") and "\n" not in text.replace("\r\n", "")
    return text[:-2].replace("\r\n ", "").split("\r\n")


def entry(**over):
    return {"uid": "u1@forthright", "title": "Campout", "start": date(2026, 10, 17), **over}


def test_the_calendar_has_the_required_properties():
    lines = unfold(ics.build_calendar("Troop 9 events", [entry()], STAMP, CHICAGO))
    assert lines[0] == "BEGIN:VCALENDAR" and lines[-1] == "END:VCALENDAR"
    assert "VERSION:2.0" in lines and any(x.startswith("PRODID:") for x in lines)
    assert "X-WR-TIMEZONE:America/Chicago" in lines
    assert lines.count("BEGIN:VEVENT") == lines.count("END:VEVENT") == 1
    for needed in ("UID:u1@forthright", "DTSTAMP:20261010T150000Z", "SUMMARY:Campout"):
        assert needed in lines


def test_an_empty_calendar_is_still_valid():
    lines = unfold(ics.build_calendar("Nothing", [], STAMP, None))
    assert lines[0] == "BEGIN:VCALENDAR" and "BEGIN:VEVENT" not in lines
    assert not any(x.startswith("X-WR-TIMEZONE") for x in lines)


def test_all_day_events_end_on_the_next_day():
    lines = unfold(ics.build_calendar("c", [entry()], STAMP, CHICAGO))
    assert "DTSTART;VALUE=DATE:20261017" in lines and "DTEND;VALUE=DATE:20261018" in lines


def test_multi_day_all_day_events_include_the_last_day():
    lines = unfold(ics.build_calendar("c", [entry(end=date(2026, 10, 18))], STAMP, CHICAGO))
    assert "DTEND;VALUE=DATE:20261019" in lines


def test_timed_events_are_converted_to_utc_in_the_troop_time_zone():
    timed = entry(start_time=time(9, 0), end_time=time(17, 0))
    lines = unfold(ics.build_calendar("c", [timed], STAMP, CHICAGO))
    assert "DTSTART:20261017T140000Z" in lines and "DTEND:20261017T220000Z" in lines  # CDT is UTC-5
    eastern = unfold(ics.build_calendar("c", [timed], STAMP, ZoneInfo("America/New_York")))
    assert "DTSTART:20261017T130000Z" in eastern  # the troop's own zone changes the instant
    winter = entry(start=date(2026, 12, 5), start_time=time(9, 0))
    assert "DTSTART:20261205T150000Z" in unfold(ics.build_calendar("c", [winter], STAMP, CHICAGO))  # CST is UTC-6


def test_a_timed_event_without_an_end_lasts_one_hour_and_a_multi_day_one_runs_to_midnight():
    one = unfold(ics.build_calendar("c", [entry(start_time=time(18, 30))], STAMP, CHICAGO))
    assert "DTSTART:20261017T233000Z" in one and "DTEND:20261018T003000Z" in one
    many = unfold(ics.build_calendar("c", [entry(start_time=time(18, 0), end=date(2026, 10, 18))], STAMP, CHICAGO))
    assert "DTEND:20261019T050000Z" in many  # midnight at the end of the 18th, Central


def test_text_is_escaped():
    assert ics.escape_text("a, b; c\\d\ne") == "a\\, b\\; c\\\\d\\ne"
    odd = entry(title="Fish, Fry; Fun", place="Camp\nLowden", description="Line one\nLine two")
    lines = unfold(ics.build_calendar("c", [odd], STAMP, CHICAGO))
    assert "SUMMARY:Fish\\, Fry\\; Fun" in lines
    assert "LOCATION:Camp\\nLowden" in lines and "DESCRIPTION:Line one\\nLine two" in lines


def test_long_lines_fold_at_75_octets_without_splitting_characters():
    long = entry(title="Camporee " + "é" * 120)
    text = ics.build_calendar("c", [long], STAMP, CHICAGO)
    for physical in text.split("\r\n")[:-1]:
        assert len(physical.encode()) <= 75
        physical.encode()  # every physical line is valid UTF-8 on its own
    summary = next(x for x in unfold(text) if x.startswith("SUMMARY:"))
    assert summary == "SUMMARY:Camporee " + "é" * 120


def test_member_feed_lists_dates_places_and_links_and_no_people():
    events = [
        ("e1", {"title": "Campout", "start": "2026-10-17", "endDate": "2026-10-18", "place": "Camp Lowden",
                "startTime": "17:30", "feeCents": 2550, "signups": {"enabled": True, "deadline": "2026-10-12"}}),
        ("e2", {"title": "Old", "start": "2026-01-01"}),
        ("e3", {"title": "", "start": "2026-10-20"}),
        ("e4", {"title": "Meeting", "start": "bad"}),
    ]  # fmt: skip
    entries = member_entries(events, "t1", URL, date(2026, 10, 10))
    assert [e["title"] for e in entries] == ["Campout"]
    got = entries[0]
    assert got["uid"] == "t1-e1@forthright" and got["url"] == f"{URL}/t/t1/events/e1"
    assert "Fee: $25.50." in got["description"] and "Sign up by Oct 12." in got["description"]
    assert got["start_time"] == time(17, 30) and got["end"] == date(2026, 10, 18)
    text = ics.build_calendar("c", entries, STAMP, CHICAGO)
    for private in ("signups", "memberId", "health", "answers"):
        assert private not in text


def test_recent_past_events_stay_for_30_days():
    keep = member_entries([("a", {"title": "Recent", "start": "2026-09-20"})], "t1", URL, date(2026, 10, 10))
    drop = member_entries([("a", {"title": "Old", "start": "2026-09-01"})], "t1", URL, date(2026, 10, 10))
    assert len(keep) == 1 and drop == []


def test_public_feed_has_only_title_day_and_place():
    shown = [{"title": "Open house", "start": "2026-11-02", "place": "Hall"}, {"title": "", "start": "2026-11-03"}]
    entries = public_entries(shown, "troop-9")
    assert len(entries) == 1 and set(entries[0]) == {"uid", "title", "start", "place"}
    assert entries[0]["uid"].endswith("@forthright") and entries == public_entries(shown, "troop-9")  # stable ids
    assert entries[0]["uid"] != public_entries(shown, "other")[0]["uid"]


def test_tokens_are_long_random_and_urlsafe():
    tokens = {new_token() for _ in range(200)}
    assert len(tokens) == 200
    assert all(len(t) >= 43 and parse_path(f"/cal/{t}.ics") == ("member", t) for t in tokens)


def test_request_paths():
    token = "A" * 43
    assert parse_path(f"/cal/{token}.ics") == ("member", token)
    assert parse_path(f"/{token}.ics") == ("member", token)
    assert parse_path("/cal/site/troop-9.ics") == ("site", "troop-9")
    assert parse_path("/cal/short.ics") is None
    assert parse_path("/cal/site/Bad_Slug.ics") is None
    assert parse_path("/cal/../etc.ics") is None
    assert parse_path("/cal/" + token) is None and parse_path("") is None
