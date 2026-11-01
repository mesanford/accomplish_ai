"""Council calendars: anyone signed in reads the shared feed links and their events; only the server writes them."""

from .emulator import Client

OK, DENIED = 200, 403
owner, leader, parent, nobody = Client("owner"), Client("leader"), Client("parent"), Client(None)


def test_council_feeds_and_events_are_read_by_anyone_signed_in_and_written_by_no_client():
    owner.set("councilFeeds/bay-lakes", {"url": "https://example.org/cal.ics", "council": "Bay-Lakes"})
    owner.set("councilEvents/bay-lakes", {"events": []})
    for path in ("councilFeeds/bay-lakes", "councilEvents/bay-lakes"):
        assert leader.get(path) == OK and parent.get(path) == OK
        assert nobody.get(path) == DENIED
        assert leader.set(path, {"url": "https://evil.example/cal.ics"}) == DENIED
