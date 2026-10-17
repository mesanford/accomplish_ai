"""Event fees (who is charged, the post_charges seam) and the sign-up emails."""

from datetime import date

import pytest

from handlers import event_emails as mail
from handlers import event_fees as fees
from handlers.signups import HELD, WAITLIST

MEMBERS = {
    "s1": {"kind": "scout"},
    "s2": {"kind": "scout"},
    "s3": {"kind": "scout"},
    "s4": {"kind": "scout"},
    "m1": {"kind": "adult"},
}


def signup(member_id, kind="scout", spot=HELD, permission="not_needed"):
    return {"memberId": member_id, "kind": kind, "spot": spot, "permission": {"state": permission}}


def test_the_fee_is_whole_cents_and_off_when_missing():
    assert fees.fee_cents({"feeCents": 2500}) == 2500
    for bad in ({}, {"feeCents": 0}, {"feeCents": -5}, {"feeCents": 12.5}, {"feeCents": True}, {"feeCents": "25"}):
        assert fees.fee_cents(bad) == 0


def test_charge_going_scouts_skips_waitlist_pending_permission_and_adults():
    signups = {
        "s1": signup("s1"),
        "s2": signup("s2", spot=WAITLIST),
        "s3": signup("s3", permission="pending"),
        "s4": signup("s4", permission="approved"),
        "m1": signup("m1", kind="adult"),
    }
    assert fees.scouts_to_charge("going", signups, {}, MEMBERS) == ["s1", "s4"]


def test_charge_attendees_uses_attendance_not_sign_ups():
    attendance = {"s1": True, "s2": False, "s3": True, "m1": True, "gone": True}
    assert fees.scouts_to_charge("attendees", {"s2": signup("s2")}, attendance, MEMBERS) == ["s1", "s3"]


def test_an_unknown_choice_is_refused():
    with pytest.raises(fees.FeeError):
        fees.scouts_to_charge("everyone", {}, {}, MEMBERS)


def test_the_seam_calls_post_charges_when_it_exists():
    calls = []

    def post_charges(*args):
        calls.append(args)

    result = fees.post_fees("t1", ["s1"], 2500, "Campout", "e1", "uid1", finder=lambda: post_charges)
    assert result == "posted" and calls == [("t1", ["s1"], 2500, "Campout", "e1", "uid1")]


def test_the_seam_records_pending_when_accounts_do_not_exist_yet():
    assert fees.post_fees("t1", ["s1"], 2500, "Campout", "e1", "uid1", finder=lambda: None) == "pending"


def test_find_post_charges_survives_missing_modules(monkeypatch):
    monkeypatch.setattr(fees, "POST_CHARGES_MODULES", ("handlers.nope_not_here", "handlers.signups"))
    assert fees.find_post_charges() is None  # none has post_charges
    monkeypatch.setattr(fees, "POST_CHARGES_MODULES", ("handlers.nope_not_here", "handlers.event_fees"))
    monkeypatch.setattr(fees, "post_charges", lambda *a: None, raising=False)
    assert fees.find_post_charges() is fees.post_charges


URL = "https://example.web.app"


def test_waitlist_email_uses_first_names_and_links_to_the_event():
    email = mail.waitlist_promoted(["Ava", "you"], ["Ava"], "Campout", "t1", "e1", URL)
    assert email.subject == "A spot opened up at Campout"
    assert "A spot opened up for Ava and you at Campout." in email.text
    assert "still needs a parent to give permission" in email.text
    assert f"{URL}/t/t1/events/e1" in email.text and "Account page" in email.html


def test_permission_email():
    email = mail.permission_needed(["Ava", "Max"], "Campout", date(2026, 10, 17), "t1", "e1", URL)
    assert (
        "Ava and Max signed up for Campout on Oct 17, 2026." in email.text and "need to give permission" in email.text
    )
    assert mail.permission_needed(["Ava"], "Campout", None, "t1", "e1", URL).text.count("needs to give permission") == 1


def test_reminder_email_mentions_the_day_the_place_and_anyone_waiting():
    email = mail.event_reminder(["Ava"], ["Max"], "Campout", date(2026, 10, 17), "Camp Lowden", "t1", "e1", URL)
    assert email.subject == "Reminder: Campout"
    assert "Campout is coming up on Oct 17, 2026 at Camp Lowden." in email.text
    assert "Signed up: Ava." in email.text and "Max still needs a parent" in email.text


def test_email_html_is_escaped():
    email = mail.event_reminder(["Ava"], [], "<b>Fish</b> & Chips", None, None, "t1", "e1", URL)
    assert "<b>Fish</b>" not in email.html and "&lt;b&gt;Fish&lt;/b&gt;" in email.html
