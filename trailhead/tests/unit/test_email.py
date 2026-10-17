import pytest

from handlers import email_templates as tpl
from handlers.email_recipients import MAX_RECIPIENTS, badge_manager_uids, card_events, choose, parent_uids, wants_email

URL = "https://example.web.app"


def test_only_the_first_name_is_used():
    assert tpl.first_name("Ava Marie Jones") == "Ava"
    assert tpl.first_name("") == "A Scout"
    assert tpl.join_names(["Ava", "Max", "Sam"]) == "Ava, Max and Sam"
    assert tpl.join_names(["Ava", "Max"]) == "Ava and Max"


def test_new_request_email():
    mail = tpl.card_requested("Ava", "Camping", "t1", URL)
    assert mail.subject == "Ava asked to start Camping"
    assert f"{URL}/t/t1/blue-cards" in mail.text and f'href="{URL}/t/t1/blue-cards"' in mail.html


def test_parent_emails():
    assert tpl.card_approved("Ava", "Camping", "s1", "t1", URL).subject == "Ava's Camping blue card was approved"
    assert tpl.card_counselor_assigned("Ava", "Camping", "s1", "t1", URL).subject == "Ava has a counselor for Camping"
    done = tpl.card_completed("Ava", "Camping", "s1", "t1", URL)
    assert done.subject == "Ava completed Camping" and f"{URL}/t/t1/scouts/s1" in done.text


def test_counselor_email_links_to_counseling():
    mail = tpl.counselor_assigned("Ava", "Camping", "t1", URL)
    assert mail.subject == "You've been assigned as Camping counselor for Ava"
    assert f"{URL}/t/t1/counseling" in mail.text


@pytest.mark.parametrize(
    "mail",
    [
        tpl.card_requested("Ava", "Camping", "t1", URL),
        tpl.card_approved("Ava", "Camping", "s1", "t1", URL),
        tpl.card_counselor_assigned("Ava", "Camping", "s1", "t1", URL),
        tpl.card_completed("Ava", "Camping", "s1", "t1", URL),
        tpl.counselor_assigned("Ava", "Camping", "t1", URL),
    ],
)
def test_every_notification_says_how_to_turn_it_off_and_links_privacy(mail):
    assert f"{URL}/account" in mail.text and f"{URL}/privacy" in mail.text
    assert f'href="{URL}/account"' in mail.html and f'href="{URL}/privacy"' in mail.html
    assert "#4f6a2e" in mail.html and "color:#ffffff" in mail.html and "Arial" in mail.html


def test_names_are_escaped_in_html_but_not_in_text():
    mail = tpl.card_requested("<b>Ava</b>", "R&D <i>", "t1", URL)
    assert "<b>Ava</b>" not in mail.html and "&lt;b&gt;Ava&lt;/b&gt;" in mail.html and "R&amp;D" in mail.html
    assert "<b>Ava</b>" in mail.text
    consent = tpl.consent_confirmation(["<script>"], "Troop <1>", "October 15, 2026", "v1", URL)
    assert "<script>" not in consent.html and "Troop &lt;1&gt;" in consent.html


def test_consent_confirmation_content():
    mail = tpl.consent_confirmation(["Ava", "Max"], "Troop 1", "October 15, 2026", "2026-10-16.1", URL)
    assert mail.subject == "You agreed to Forthright's notice for Ava and Max"
    for part in (
        "Ava and Max",
        "October 15, 2026",
        "2026-10-16.1",
        "withdraw",
        f"{URL}/privacy",
        "privacy@msanford.com",
    ):
        assert part in mail.text
    assert "privacy@msanford.com" in mail.text
    assert "turn these emails off" not in mail.text  # the confirmation can't be switched off


ACCESS = {
    "lead": {"roles": ["leader"], "memberId": "m-lead"},
    "sm": {"roles": ["leader", "scoutmaster"], "memberId": "m-sm"},
    "solo-sm": {"roles": ["scoutmaster"], "memberId": "m-solo"},
    "chair": {"roles": ["advancement"], "memberId": "m-chair"},
    "mom": {"roles": ["parent"], "memberId": "m-mom", "scoutIds": ["s1"]},
    "pending": {"roles": ["parent"], "memberId": "m-pen", "scoutIds": ["s1"], "consentPendingScoutIds": ["s1"]},
    "other": {"roles": ["parent"], "memberId": "m-other", "scoutIds": ["s2"]},
    "mbc": {"roles": ["counselor"], "memberId": "m-mbc"},
    "dad-leader": {"roles": ["leader", "parent"], "memberId": "m-dad", "scoutIds": ["s1"]},
}
SCOUT = {"guardianIds": ["m-mom", "m-pen", "m-dad"]}


def test_only_scoutmasters_and_chairs_get_requests():
    assert badge_manager_uids(ACCESS) == ["chair", "sm", "solo-sm"]  # not assistant leaders


def test_only_confirmed_linked_parents_get_updates():
    assert parent_uids("s1", SCOUT, ACCESS) == ["dad-leader", "mom"]  # not pending, not another Scout's parent


def test_a_parent_not_named_on_the_scout_is_left_out():
    assert parent_uids("s1", {"guardianIds": []}, ACCESS) == []


def test_opt_outs_are_skipped():
    users = {"mom": {"emailNotifications": False}, "dad-leader": {"emailNotifications": True}, "x": None}
    assert not wants_email({"emailNotifications": False})
    assert wants_email(None) and wants_email({})
    assert choose(["mom", "dad-leader", "x"], users) == ["dad-leader", "x"]


def test_recipients_are_capped_and_deduplicated():
    uids = [f"u{i}" for i in range(50)]
    assert len(choose(uids + uids, {})) == MAX_RECIPIENTS


def test_card_events():
    new = {"status": "requested", "scoutId": "s1"}
    assert card_events(None, new) == ["requested"]
    assert card_events(new, {**new, "status": "approved"}) == ["approved"]
    assigned = {**new, "status": "counselor_assigned", "counselorUid": "mbc"}
    assert card_events({**new, "status": "approved"}, assigned) == ["assigned", "counselor"]
    reassigned = {**assigned, "counselorUid": "mbc2"}
    assert card_events(assigned, reassigned) == ["counselor"]  # parents were already told
    assert card_events(assigned, {**assigned, "status": "complete"}) == ["completed"]
    assert card_events(assigned, {**assigned, "photoPaths": ["x"]}) == []
    assert card_events(assigned, {**assigned, "status": "cancelled"}) == []
    assert card_events(None, {**new, "source": "paper", "status": "complete"}) == []
    assert card_events(new, None) == []
