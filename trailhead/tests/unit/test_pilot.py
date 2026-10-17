import pytest

from handlers.membership import InvalidInput
from handlers.pilot import new_pilot_request, operator_notice
from handlers.recruiting import Spam

FORM = {
    "name": " Pat Leader ",
    "email": "pat@example.com",
    "unit": "303",
    "council": "Pine Council",
    "role": "Scoutmaster",
    "note": "Hello",
}


def test_a_valid_form_is_cleaned():
    request = new_pilot_request(FORM)
    assert request["name"] == "Pat Leader"
    assert request["role"] == "Scoutmaster"


def test_council_and_note_are_optional():
    request = new_pilot_request({**FORM, "council": "", "note": None})
    assert (request["council"], request["note"]) == ("", "")


def test_required_fields_and_limits():
    for key in ("name", "email", "unit", "role"):
        with pytest.raises(InvalidInput):
            new_pilot_request({**FORM, key: " "})
    for bad in ("nope", "a@b", "a b@c.com"):
        with pytest.raises(InvalidInput, match="valid email"):
            new_pilot_request({**FORM, "email": bad})
    with pytest.raises(InvalidInput, match="role"):
        new_pilot_request({**FORM, "role": "Emperor"})
    with pytest.raises(InvalidInput, match="1000"):
        new_pilot_request({**FORM, "note": "x" * 1001})
    with pytest.raises(InvalidInput):
        new_pilot_request(None)


def test_honeypot_is_spam():
    with pytest.raises(Spam):
        new_pilot_request({**FORM, "website": "http://spam.example"})


def test_operator_notice_names_the_troop_and_escapes_html():
    notice = operator_notice(new_pilot_request({**FORM, "name": "<b>Pat</b>"}))
    assert "303, Pine Council" in notice.text
    assert "<b>Pat</b>" not in notice.html
    assert "Hello" not in notice.text
