"""Announcements: audiences, Youth Protection, validation, email rendering, limits and the retention rule."""

from datetime import UTC, date, datetime

import pytest

from endpoints.mailer import send_all
from handlers import announcement_audience as aud
from handlers.announcement_email import event_line, render
from handlers.announcements import (
    MAX_EMAIL_RECIPIENTS,
    MAX_EMAILED_PER_DAY,
    can_manage,
    can_post,
    can_take_email_slot,
    has_current_ypt,
    parse_audience,
    parse_content,
)
from handlers.email_templates import Email
from handlers.membership import InvalidInput
from handlers.retention import ANNOUNCEMENT_MONTHS, announcement_due

TODAY = date(2026, 10, 16)
MEMBERS = {
    "m-lead": {"kind": "adult", "displayName": "Pat Lead", "uid": "lead"},
    "m-mom": {"kind": "adult", "displayName": "Mom", "uid": "mom"},
    "m-dad": {"kind": "adult", "displayName": "Dad", "uid": "dad"},
    "m-pend": {"kind": "adult", "displayName": "Pending", "uid": "pend"},
    "m-com": {"kind": "adult", "displayName": "Cam Committee", "uid": "com"},
    "s1": {"kind": "scout", "displayName": "Ava Jones", "uid": "scout1", "guardianIds": ["m-mom", "m-pend"]},
    "s2": {"kind": "scout", "displayName": "Sam Smith", "guardianIds": ["m-dad"]},
}
ACCESS = {
    "lead": {"memberId": "m-lead", "roles": ["leader", "scoutmaster"]},
    "mom": {"memberId": "m-mom", "roles": ["parent"], "scoutIds": ["s1"]},
    "dad": {"memberId": "m-dad", "roles": ["parent"], "scoutIds": ["s2"]},
    "pend": {"memberId": "m-pend", "roles": ["parent"], "scoutIds": ["s1"], "consentPendingScoutIds": ["s1"]},
    "com": {"memberId": "m-com", "roles": ["committee"]},
    "scout1": {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]},
}


def resolve(spec, signups=None, title=""):
    return aud.resolve(spec, MEMBERS, ACCESS, signups, title)


def test_troop_reaches_everyone_and_includes_scouts():
    a = resolve({"type": "troop"})
    assert a.uids == ["com", "dad", "lead", "mom", "pend", "scout1"] and a.includes_scouts


def test_parents_adults_and_leaders_never_include_scouts():
    assert resolve({"type": "parents"}).uids == ["dad", "mom", "pend"]
    assert resolve({"type": "adults"}).uids == ["com", "dad", "lead", "mom", "pend"]
    assert resolve({"type": "leaders"}).uids == ["lead"]
    for kind in ("parents", "adults", "leaders"):
        assert not resolve({"type": kind}).includes_scouts


def test_parents_of_chosen_scouts_skips_a_parent_who_has_not_agreed():
    a = resolve({"type": "parentsOf", "scoutIds": ["s1"]})
    assert a.uids == ["mom"] and a.label == "Parents of Ava" and not a.includes_scouts
    assert resolve({"type": "parentsOf", "scoutIds": ["s1", "s2", "m-lead"]}).uids == ["dad", "mom"]


def test_event_audience_uses_sign_ups_and_adds_parents_of_scouts_under_13():
    a = resolve({"type": "event", "eventId": "e1"}, {"m-com", "s2", "ghost"}, "Fall campout")
    assert a.uids == ["com", "dad"] and a.includes_scouts and a.label == "Signed up for Fall campout"
    assert resolve({"type": "event", "eventId": "e1"}, {"m-com"}).includes_scouts is False
    assert resolve({"type": "event", "eventId": "e1"}, set()).uids == []


def test_sign_up_documents_of_any_shape_are_read():
    docs = [
        ("m-a", {}),
        ("x1", {"memberId": "m-b"}),
        ("m-c", {"status": "Declined"}),
        ("m-d", {"going": False}),
        ("m-e", {"status": "going"}),
    ]
    assert aud.signed_up_ids(docs) == {"m-a", "m-b", "m-e"}


def test_readers_always_include_the_poster_and_scoutmasters():
    a = resolve({"type": "parents"})
    assert aud.readers(a, "com", ACCESS) == ["com", "dad", "lead", "mom", "pend"]


def test_email_goes_to_adults_only_never_scouts_and_never_the_poster():
    assert aud.email_uids(resolve({"type": "troop"}), "lead", MEMBERS, ACCESS) == ["com", "dad", "mom", "pend"]
    assert aud.email_uids(resolve({"type": "troop"}), "com", MEMBERS, ACCESS) == ["dad", "lead", "mom", "pend"]


def test_announcement_emails_have_their_own_opt_out_that_is_on_by_default():
    assert aud.wants_announcement_email(None) and aud.wants_announcement_email({})
    assert aud.wants_announcement_email({"emailNotifications": False})
    assert not aud.wants_announcement_email({"emailAnnouncements": False})
    users = {"a": {"emailAnnouncements": False}, "b": None}
    assert aud.choose_emails(["a", "b", "b", "c"], users, 10) == (["b", "c"], 0)


def test_recipient_cap_keeps_the_first_and_counts_the_rest():
    uids = [f"u{i:03d}" for i in range(MAX_EMAIL_RECIPIENTS + 7)]
    chosen, left_out = aud.choose_emails(uids, {}, MAX_EMAIL_RECIPIENTS)
    assert chosen == uids[:MAX_EMAIL_RECIPIENTS] and left_out == 7


def test_send_all_honors_a_larger_cap_and_defaults_to_twenty():
    sent = []
    addresses = [f"{i}@x.org" for i in range(60)]
    mail = Email("s", "t", "<p>h</p>")
    assert send_all("t", addresses, mail, env={}) == 20
    assert send_all("t", addresses, mail, env={}, cap=MAX_EMAIL_RECIPIENTS) == 60 and sent == []


def test_who_can_post_and_who_can_change_a_post():
    for role in ("leader", "scoutmaster", "advancement", "committee"):
        assert can_post({"roles": [role]})
    for role in ("parent", "scout", "counselor"):
        assert not can_post({"roles": [role]})
    post = {"postedByUid": "com"}
    assert can_manage({"roles": ["committee"]}, "com", post)
    assert can_manage({"roles": ["leader", "scoutmaster"]}, "lead", post)
    assert not can_manage({"roles": ["leader"]}, "asst", post)


def test_posting_to_scouts_needs_training_that_has_not_expired():
    assert has_current_ypt({"yptExpiresAt": datetime(2027, 1, 1, tzinfo=UTC)}, TODAY)
    assert has_current_ypt({"yptExpiresAt": datetime(2026, 10, 16, 23, 59, tzinfo=UTC)}, TODAY)
    assert not has_current_ypt({"yptExpiresAt": datetime(2026, 10, 15, tzinfo=UTC)}, TODAY)
    assert not has_current_ypt({}, TODAY) and not has_current_ypt(None, TODAY)


def test_an_announcement_needs_a_title_and_text_but_a_newsletter_can_use_sections():
    with pytest.raises(InvalidInput):
        parse_content({"title": "Hi"})
    with pytest.raises(InvalidInput):
        parse_content({"body": "Hi"})
    with pytest.raises(InvalidInput):
        parse_content({"kind": "newsletter", "title": "News"})
    ok = parse_content(
        {"kind": "newsletter", "title": " News\nletter ", "sections": [{"heading": "A", "text": ""}, {}]}
    )
    assert ok["title"] == "News letter" and ok["sections"] == [{"heading": "A", "text": ""}]
    assert (
        parse_content({"title": "T", "body": "B", "sections": [{"heading": "x"}], "eventIds": ["e"]})["sections"] == []
    )


def test_limits_on_length_sections_and_events():
    with pytest.raises(InvalidInput):
        parse_content({"title": "T" * 121, "body": "B"})
    with pytest.raises(InvalidInput):
        parse_content({"title": "T", "body": "B" * 5001})
    with pytest.raises(InvalidInput):
        parse_content({"kind": "newsletter", "title": "T", "sections": [{"text": "x"}] * 7})
    with pytest.raises(InvalidInput):
        parse_content({"kind": "newsletter", "title": "T", "eventIds": [f"e{i}" for i in range(11)]})


def test_audience_choices_are_checked():
    assert parse_audience({"type": "parents"}) == {"type": "parents"}
    assert parse_audience({"type": "event", "eventId": "e1"}) == {"type": "event", "eventId": "e1"}
    assert parse_audience({"type": "parentsOf", "scoutIds": ["a", "a", "b"]})["scoutIds"] == ["a", "b"]
    for bad in (None, {}, {"type": "everyone"}, {"type": "event"}, {"type": "parentsOf", "scoutIds": []}):
        with pytest.raises(InvalidInput):
            parse_audience(bad)


def test_five_emailed_announcements_a_day():
    assert MAX_EMAILED_PER_DAY == 5
    assert can_take_email_slot(0) and can_take_email_slot(4)
    assert not can_take_email_slot(5) and not can_take_email_slot(6)


POST = {
    "title": "Campout <b>now</b>",
    "body": "Bring a coat & a hat.\n\nSecond line\nthird",
    "sections": [{"heading": "Gear <i>list</i>", "text": "Tent\n\nBag"}],
    "events": [{"id": "e1", "title": "Fall <campout>", "start": "2026-10-24", "place": "Camp Bell & Co"}],
}


def mail():
    return render(POST, "Pat <Lead>", "Troop 9", "t1", "a1", "https://app.example.org")


def test_email_names_the_sender_and_troop_links_to_the_app_and_explains_opt_out():
    m = mail()
    assert m.subject == "Troop 9: Campout <b>now</b>"
    for part in (m.text, m.html.replace("&lt;", "<").replace("&gt;", ">")):
        assert "Pat <Lead>" in part and "Troop 9" in part
    assert "https://app.example.org/t/t1/announcements#a1" in m.text
    assert "To turn announcement emails off, open your Account page: https://app.example.org/account" in m.text
    assert 'href="https://app.example.org/t/t1/announcements#a1"' in m.html and "#4f6a2e" in m.html
    assert "Arial" in m.html and "Account page</a>" in m.html


def test_email_escapes_everything_a_person_typed():
    html = mail().html
    for raw in ("<b>now</b>", "<i>list</i>", "<campout>", "<Lead>"):
        assert raw not in html
    for safe in (
        "&lt;b&gt;now&lt;/b&gt;",
        "Gear &lt;i&gt;list&lt;/i&gt;",
        "Fall &lt;campout&gt;",
        "Camp Bell &amp; Co",
    ):
        assert safe in html
    assert "a coat &amp; a hat" in html and "Second line<br>third" in html


def test_plain_text_email_has_sections_and_events():
    text = mail().text
    assert "GEAR <I>LIST</I>" in text and "Tent" in text
    assert "- Fall <campout> · Sat Oct 24, 2026 · Camp Bell & Co" in text
    assert text.index("UPCOMING EVENTS") < text.index("Read it in Forthright")


def test_event_line_survives_odd_dates():
    assert event_line({"title": "Hike", "start": "2026-10-24T09:00"}) == "Hike · Sat Oct 24, 2026"
    assert event_line({"title": "Hike", "start": "soon"}) == "Hike · soon"
    assert event_line({"title": "Hike"}) == "Hike"


def at(y, m, d):
    return datetime(y, m, d, 12, tzinfo=UTC)


def test_announcements_are_deleted_24_months_after_posting():
    assert ANNOUNCEMENT_MONTHS == 24
    posted = {"createdAt": at(2024, 10, 16)}
    assert announcement_due(posted, date(2026, 10, 16))
    assert not announcement_due(posted, date(2026, 10, 15))
    assert not announcement_due({"createdAt": at(2024, 10, 17)}, date(2026, 10, 16))


def test_editing_does_not_extend_retention_and_unknown_dates_are_kept():
    edited = {"createdAt": at(2024, 1, 5), "editedAt": at(2026, 10, 1)}
    assert announcement_due(edited, date(2026, 10, 16))
    assert not announcement_due({}, date(2030, 1, 1)) and not announcement_due({"createdAt": "x"}, date(2030, 1, 1))
