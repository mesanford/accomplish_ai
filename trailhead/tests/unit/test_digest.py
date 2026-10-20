"""The weekly family digest: what goes in it, for whom, and the email."""

from datetime import date

from handlers import digest as dg
from handlers.digest_email import weekly_digest

SUNDAY = date(2026, 10, 25)
EVENTS = [
    ("meet", {"title": "Troop meeting", "start": "2026-10-27", "startTime": "19:00", "place": "Hall"}),
    (
        "camp",
        {
            "title": "Campout",
            "start": "2026-10-31",
            "signups": {"enabled": True, "deadline": "2026-10-28"},
        },
    ),
    ("hike", {"title": "Hike", "start": "2026-10-29", "cancelled": True}),
    (
        "later",
        {
            "title": "Winter camp",
            "start": "2026-12-12",
            "signups": {"enabled": True, "deadline": "2026-10-30"},
        },
    ),
    (
        "closed",
        {
            "title": "Court of honor",
            "start": "2026-12-01",
            "signups": {"enabled": True, "deadline": "2026-10-29", "closed": True},
        },
    ),
    ("old", {"title": "Last week", "start": "2026-10-20"}),
]
FAMILIES = {"camp": {"mom": ["Sam"]}}
OWED = {"later": {"mom": ["Sam"]}, "hike": {"mom": ["Ava"]}}
POSTS = [{"title": "Uniform swap", "readerUids": ["mom", "dad"]}, {"title": "Leaders only", "readerUids": ["lead"]}]


def test_the_window_is_the_coming_monday_to_sunday():
    assert dg.window(SUNDAY) == (date(2026, 10, 26), date(2026, 11, 1))
    assert dg.week_of(SUNDAY) == "2026-10-26"


def test_a_parent_gets_this_weeks_events_deadlines_slips_and_posts():
    d = dg.build("mom", EVENTS, FAMILIES, OWED, POSTS, SUNDAY)
    assert [(e["title"], e["names"], e["cancelled"]) for e in d.events] == [
        ("Troop meeting", [], False),
        ("Hike", [], True),
        ("Campout", ["Sam"], False),
    ]
    assert d.events[0]["time"] == "7:00 pm" and d.events[0]["place"] == "Hall"
    assert [x["title"] for x in d.deadlines] == ["Campout", "Winter camp"]
    assert d.waiting == [{"title": "Winter camp", "names": ["Sam"]}]  # never a slip for a cancelled event
    assert d.posts == ["Uniform swap"]


def test_a_quiet_week_is_empty():
    assert dg.build("mom", [("old", EVENTS[-1][1])], {}, {}, [], SUNDAY).empty()


def test_only_adults_and_parents_are_readers():
    access = {"mom": {"memberId": "m1"}, "scout": {"memberId": "s1"}, "lead": {"memberId": "m2"}}
    members = {"m1": {"kind": "adult"}, "s1": {"kind": "scout"}, "m2": {"kind": "adult"}}
    assert dg.readers(access, members) == ["lead", "mom"]


def test_turning_it_off():
    assert dg.wants_digest(None) and dg.wants_digest({"emailDigest": True})
    assert not dg.wants_digest({"emailDigest": False})


def test_the_email():
    d = dg.build("mom", EVENTS, FAMILIES, OWED, POSTS, SUNDAY)
    email = weekly_digest("Troop 101", d, date(2026, 10, 26), "t1", "https://x")
    assert email.subject == "Troop 101: the week of Oct 26"
    assert "- Tue, Oct 27 · 7:00 pm · Troop meeting · Hall" in email.text
    assert "- CANCELLED: Thu, Oct 29 · Hike" in email.text
    assert "- Sat, Oct 31 · Campout (signed up: Sam)" in email.text
    assert "Waiting for your permission\n- Sam: Winter camp" in email.text
    assert "- Campout: sign up by Oct 28, 2026" in email.text
    assert "New announcements\n- Uniform swap" in email.text
    assert "https://x/account" in email.text and "<script" not in email.html


def test_names_and_titles_are_escaped_in_html():
    d = dg.Digest(posts=["<b>Hi</b>"])
    assert "&lt;b&gt;Hi&lt;/b&gt;" in weekly_digest("T", d, SUNDAY, "t1", "https://x").html
