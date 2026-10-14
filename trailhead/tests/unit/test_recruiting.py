import pytest

from handlers.membership import InvalidInput, new_invite
from handlers.recruiting import Spam, new_lead
from tests.unit.test_membership import NOW

FORM = {"name": " Jordan Lee ", "email": "jordan@example.com", "scoutAge": "11", "message": "Hi!"}


def test_valid_form_becomes_a_new_lead():
    lead = new_lead({**FORM, "phone": "555-0100"})
    assert lead["name"] == "Jordan Lee"
    assert lead["status"] == "new"
    assert lead["notes"] == ""
    assert lead["source"] == "website"
    assert (lead["scoutAge"], lead["grade"], lead["phone"]) == (11, None, "555-0100")


def test_age_or_grade():
    assert new_lead({**FORM, "scoutAge": "6th grade"})["grade"] == "6th grade"
    assert new_lead({**FORM, "scoutAge": ""})["scoutAge"] is None
    for bad in ("9", "18", "42"):
        with pytest.raises(InvalidInput, match="10 to 17"):
            new_lead({**FORM, "scoutAge": bad})


def test_name_and_email_are_required_and_checked():
    with pytest.raises(InvalidInput, match="name"):
        new_lead({**FORM, "name": "  "})
    for bad in ("", "nope", "a@b", "a b@c.com"):
        with pytest.raises(InvalidInput, match="email"):
            new_lead({**FORM, "email": bad})


def test_length_caps():
    with pytest.raises(InvalidInput, match="1000"):
        new_lead({**FORM, "message": "x" * 1001})
    with pytest.raises(InvalidInput, match="80"):
        new_lead({**FORM, "name": "x" * 81})


def test_honeypot_must_be_empty():
    with pytest.raises(Spam):
        new_lead({**FORM, "website": "http://spam.example"})
    assert new_lead({**FORM, "website": "  "})["status"] == "new"


def test_parent_invite_without_scouts_needs_a_lead():
    data = {"role": "parent", "scoutIds": []}
    with pytest.raises(InvalidInput):
        new_invite(data, set(), set(), NOW)
    assert new_invite({**data, "leadId": "L1"}, set(), set(), NOW)["scoutIds"] == []
    with pytest.raises(InvalidInput):
        new_invite({**data, "leadId": "L1", "scoutIds": ["nope"]}, {"s1"}, set(), NOW)
