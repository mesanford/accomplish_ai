import pytest

from handlers import drive_time as dt
from handlers.membership import InvalidInput

PIN = (
    "https://www.google.com/maps/place/Pine+Lake+State+Park/@44.90,-93.10,12z/"
    "data=!4m6!3m5!1s0x0:0x1!8m2!3d44.9512!4d-93.0834!16s"
)


def test_a_place_link_uses_its_pin_before_the_maps_center():
    assert dt.read_link(PIN) == ("coords", (44.9512, -93.0834))
    assert dt.read_link("https://www.google.com/maps/@44.97,-93.26,15z") == ("coords", (44.97, -93.26))


def test_query_links_give_coordinates_or_a_name_to_look_up():
    assert dt.read_link("https://www.google.com/maps?q=44.5,-93.25") == ("coords", (44.5, -93.25))
    link = "https://www.google.com/maps/search/?api=1&query=Camp+Tesomas"
    assert dt.read_link(link) == ("query", "Camp Tesomas")
    assert dt.read_link("https://maps.google.com/maps/place/Philmont+Scout+Ranch/") == ("query", "Philmont Scout Ranch")


def test_short_links_are_followed_and_everything_else_is_refused():
    assert dt.read_link("https://maps.app.goo.gl/AbC123") == ("short", "https://maps.app.goo.gl/AbC123")
    for bad in (
        "http://www.google.com/maps/@44.97,-93.26,15z",  # not https
        "https://www.google.com/search?q=camp",  # Google, but not Maps
        "https://evil.example/maps/@44.97,-93.26,15z",
        "https://www.google.com.evil.example/maps/@1.0,2.0",
        "javascript:alert(1)",
        "",
        None,
        "https://www.google.com/maps/" + "x" * 500,
    ):
        with pytest.raises(InvalidInput):
            dt.read_link(bad)
    with pytest.raises(InvalidInput, match="doesn't point at a place"):
        dt.read_link("https://www.google.com/maps")


def test_out_of_range_coordinates_are_not_trusted():
    with pytest.raises(InvalidInput):
        dt.read_link("https://www.google.com/maps/@95.0,-93.26,15z")


def test_destination_follows_short_links_only_to_google():
    hops = {"https://maps.app.goo.gl/x": PIN}
    assert dt.destination("https://maps.app.goo.gl/x", hops.get, lambda _: None) == (44.9512, -93.0834)
    with pytest.raises(InvalidInput, match="short link"):
        dt.destination("https://maps.app.goo.gl/x", lambda _: "https://evil.example/maps/@1.0,2.0", lambda _: None)
    with pytest.raises(InvalidInput, match="short link"):
        dt.destination("https://maps.app.goo.gl/x", lambda _: None, lambda _: None)
    with pytest.raises(InvalidInput, match="short link"):  # a loop of short links stops
        dt.destination("https://maps.app.goo.gl/x", lambda u: u, lambda _: None)


def test_destination_looks_up_a_name_when_the_link_has_no_pin():
    link = "https://www.google.com/maps/search/?api=1&query=Camp+Tesomas"
    assert dt.destination(link, lambda _: None, lambda name: (45.9, -89.7) if name == "Camp Tesomas" else None) == (
        45.9,
        -89.7,
    )
    with pytest.raises(InvalidInput, match="couldn't find"):
        dt.destination(link, lambda _: None, lambda _: None)


def test_home_address_needs_a_street_city_and_state_or_a_zip():
    full = {"place": "St. Mark's", "street": "12 Elm St", "city": "Springfield", "state": "IL", "zip": "62701"}
    assert dt.home_address(full) == "12 Elm St, Springfield, IL 62701"
    assert dt.home_address({"zip": "62701"}) == "62701"
    assert dt.home_address({"city": "Springfield", "state": "IL"}) is None
    assert dt.home_address(None) is None


def test_service_answers_are_read_defensively():
    assert dt.geocoded({"features": [{"geometry": {"coordinates": [-89.65, 39.78]}}]}) == (39.78, -89.65)
    assert dt.geocoded({"features": []}) is None
    assert dt.route_summary({"routes": [{"summary": {"duration": 5130.4, "distance": 132000}}]}) == (86, 82.0)
    assert dt.route_summary({"routes": []}) is None
    assert dt.route_summary({"error": "nope"}) is None
