"""What families hear when an event moves, changes place or is cancelled."""

from datetime import date

from handlers import event_changes as ch
from handlers import event_emails as mail
from handlers import push

TODAY = date(2026, 10, 20)
BASE = {"title": "Campout", "start": "2026-10-23", "place": "Camp Lowden", "startTime": "18:00"}


def test_creating_or_deleting_an_event_says_nothing():
    assert ch.change_of(None, BASE, TODAY) is None
    assert ch.change_of(BASE, None, TODAY) is None


def test_a_new_title_or_fee_alone_says_nothing():
    assert ch.change_of(BASE, {**BASE, "title": "Fall campout", "feeCents": 2500}, TODAY) is None


def test_a_move_lists_the_new_and_old_date_time_and_place():
    after = {**BASE, "start": "2026-10-24", "startTime": "19:30", "place": "Camp Kiwanis"}
    change = ch.change_of(BASE, after, TODAY)
    assert change.kind == ch.CHANGED
    assert change.lines == [
        "New date: Oct 24, 2026 (was Oct 23, 2026).",
        "Time: 7:30 pm (was 6:00 pm).",
        "Place: Camp Kiwanis (was Camp Lowden).",
    ]


def test_a_cleared_place_and_a_new_end_time_are_described():
    after = {**BASE, "place": "", "endTime": "21:00"}
    assert ch.change_of(BASE, after, TODAY).lines == [
        "Time: 6:00 pm to 9:00 pm (was 6:00 pm).",
        "Place: none any more (was Camp Lowden).",
    ]


def test_cancelling_and_restoring():
    cancelled = {**BASE, "cancelled": True}
    assert ch.change_of(BASE, cancelled, TODAY).kind == ch.CANCELLED
    assert ch.change_of(cancelled, BASE, TODAY).kind == ch.RESTORED
    # Details of an event that stays cancelled are nobody's news.
    assert ch.change_of(cancelled, {**cancelled, "place": "Elsewhere"}, TODAY) is None


def test_a_past_event_says_nothing_but_moving_a_past_event_into_the_future_does():
    past = {**BASE, "start": "2026-10-01"}
    assert ch.change_of(past, {**past, "place": "Gym"}, TODAY) is None
    assert ch.change_of(past, {**past, "start": "2026-11-01"}, TODAY).kind == ch.CHANGED


def test_details_already_announced_are_not_sent_again():
    after = {**BASE, "place": "Gym"}
    assert ch.change_of(BASE, {**after, "alertedFor": ch.signature(after)}, TODAY) is None
    # Writing alertedFor itself is not a change.
    assert ch.change_of(after, {**after, "alertedFor": ch.signature(after)}, TODAY) is None


def test_the_whole_troop_hears_only_without_sign_ups_and_only_about_soon_events():
    assert ch.whole_troop(BASE, TODAY)
    assert not ch.whole_troop({**BASE, "signups": {"enabled": True}}, TODAY)
    assert not ch.whole_troop({**BASE, "start": "2026-11-20"}, TODAY)
    assert not ch.whole_troop({**BASE, "start": "2026-10-19"}, TODAY)


def test_clock():
    assert ch.clock("00:05") == "12:05 am"
    assert ch.clock("12:00") == "12:00 pm"
    assert ch.clock("bad") is None


def test_the_emails_and_pushes():
    cancelled = mail.event_changed(ch.CANCELLED, "Campout", "Oct 23, 2026", [], "Storms.", "t1", "e1", "https://x")
    assert cancelled.subject == "Cancelled: Campout"
    assert "Campout on Oct 23, 2026 is cancelled." in cancelled.text
    assert "From the leaders: Storms." in cancelled.text
    assert "https://x/t/t1/events/e1" in cancelled.text
    moved = mail.event_changed(ch.CHANGED, "Campout", None, ["Place: Gym (was Hall)."], None, "t1", "e1", "https://x")
    assert moved.subject == "Changed: Campout" and "Place: Gym (was Hall)." in moved.text
    assert "From the leaders" not in moved.text
    note = push.event_changed(ch.CANCELLED, "Campout $25", "t1", "e1")
    assert note.title == "Event cancelled" and "$" not in note.body and note.path == "/t/t1/events/e1"
    assert push.event_changed(ch.CHANGED, "Campout", "t1", "e1").title == "Event changed"


def test_the_series_email():
    email = mail.series_changed(
        "Troop meeting", date(2026, 11, 3), 6, ["Time: 7:30 pm (was 7:00 pm)."], False, "t1", "e1", "https://x"
    )
    assert email.subject == "Changed: Troop meeting"
    assert "Troop meeting has changed from Nov 3, 2026 on (6 dates)." in email.text
    stopped = mail.series_changed("Troop meeting", date(2026, 11, 3), 1, [], True, "t1", "e1", "https://x")
    assert stopped.subject == "Cancelled: Troop meeting" and "(date)" in stopped.text
