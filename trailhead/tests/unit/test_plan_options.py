import pytest

from handlers import plans_options as opts
from handlers.membership import InvalidInput
from handlers.plans_erase import record_update

CARD = {
    "name": " Pine Lake ",
    "links": ["https://example.org/camp"],
    "mapsUrl": "https://maps.app.goo.gl/AbC123",
    "costCents": 1500,
    "driveMinutes": 85,
    "driveEstimated": True,
    "amenities": ["water", "hot tub", "showers"],
    "bookingOpens": {"date": "2027-01-15", "note": "Group sites"},
    "availability": {"state": "held", "note": "Until Friday"},
}


def test_a_card_is_cleaned_and_keeps_only_known_values():
    out = opts.option(CARD)
    assert out["name"] == "Pine Lake" and out["amenities"] == ["water", "showers"]
    assert out["bookingOpens"] == {"date": "2027-01-15", "note": "Group sites"}
    assert out["driveEstimated"] is True
    assert "availability" not in out and "pinned" not in out and "likes" not in out
    assert opts.option({"name": "X", "driveEstimated": True})["driveEstimated"] is False  # no minutes, no estimate
    assert opts.option({"name": "X"})["bookingOpens"] is None


def test_bad_cards_are_refused():
    for bad in (
        {"name": ""},
        {"name": "x" * 121},
        {"name": "X", "links": ["https://a.example"] * 6},
        {"name": "X", "links": ["javascript:alert(1)"]},
        {"name": "X", "links": ["https://a.example/ with space"]},
        {"name": "X", "mapsUrl": "https://evil.example/maps/@1.0,2.0"},
        {"name": "X", "costCents": -1},
        {"name": "X", "costCents": 12.5},
        {"name": "X", "capacity": 20000},
        {"name": "X", "bookingOpens": {"date": "soon"}},
        {"name": "X", "pros": "x" * 1001},
    ):
        with pytest.raises(InvalidInput):
            opts.option(bad)


def test_availability_is_read_and_compared():
    assert opts.availability({"state": "booked", "note": " Site 4 "}) == ("booked", "Site 4")
    assert opts.availability({"state": "maybe"}) == ("unknown", "")
    assert not opts.availability_changed({"state": "held", "note": ""}, "held", "")
    assert opts.availability_changed({"state": "held", "note": ""}, "booked", "")
    assert opts.availability_changed({"state": "held"}, "held", "Until Friday")


def test_scouts_change_only_their_own_cards_and_adults_any():
    card = {"createdByMemberId": "s1"}
    assert opts.may_edit(card, "s1", adult_editor=False)
    assert not opts.may_edit(card, "s2", adult_editor=False)
    assert not opts.may_edit({"createdByMemberId": None}, None, adult_editor=False)
    assert opts.may_edit(card, "m-leader", adult_editor=True)


def test_removing_someone_takes_their_like_off_a_card():
    assert record_update({"likes": ["s1", "s2"]}, "s1") == {"likes": ["s2"]}
    assert record_update({"likes": ["s2"]}, "s1") is None
