import time

from endpoints import places_job as job
from handlers import places as P
from handlers import places_find as find
from handlers import places_ha as ha
from handlers.places_diff import changes, content_hash
from handlers.places_states import NAMES, NEIGHBORS, booking_site, region

FAC = {
    "FacilityID": "1",
    "FacilityName": "Pine Lake Campground",
    "FacilityTypeDescription": "Campground",
    "Enabled": "true",
    "FacilityLatitude": "44.9",
    "FacilityLongitude": "-89.6",
    "Reservable": "true",
    "FacilityDescription": "<p>Lake &amp; trails</p>",
    "ParentRecAreaID": "",
}


def test_states_border_each_other_both_ways_and_a_region_starts_at_home():
    for state, near in NEIGHBORS.items():
        assert state in NAMES
        for other in near.split():
            assert state in NEIGHBORS[other].split(), (state, other)
    assert region("WI")[0] == "WI" and "MN" in region("WI") and len(region("TN")) <= 10
    assert region("XX") == [] and booking_site("WI").startswith("https://")


def test_federal_campgrounds_need_a_place_and_borrow_a_close_neighbors_state():
    near = {**FAC, "FacilityID": "2", "FacilityLatitude": "44.95", "FacilityLongitude": "-89.6"}
    far = {**FAC, "FacilityID": "3", "FacilityLatitude": "30.0", "FacilityLongitude": "-100.0"}
    other = [
        {**FAC, "FacilityID": "4", "FacilityTypeDescription": "Facility"},
        {**FAC, "FacilityID": "5", "Enabled": "false"},
    ]
    out = P.federal_places([FAC, near, far, *other], [{"FacilityID": "1", "AddressStateCode": "WI"}], [])
    assert set(out) == {"ridb_1", "ridb_2"}
    assert out["ridb_2"]["state"] == "WI"  # 5.5 km from a Wisconsin campground
    assert out["ridb_1"]["description"] == "Lake & trails" and out["ridb_1"]["bookingUrl"].endswith("/1")


def test_state_parks_from_openstreetmap_note_campgrounds_mapped_nearby():
    elements = [
        {"type": "way", "id": 7, "tags": {"name": "Devil's Lake State Park"}, "center": {"lat": 43.42, "lon": -89.73}},
        {
            "type": "relation",
            "id": 8,
            "tags": {"name": "Devil's Lake State Park"},
            "center": {"lat": 43.42, "lon": -89.73},
        },
        {"type": "way", "id": 9, "tags": {"name": "Aztalan State Park"}, "center": {"lat": 43.07, "lon": -88.86}},
        {"type": "node", "id": 10, "lat": 43.43, "lon": -89.72, "tags": {"tourism": "camp_site"}},
        {"type": "way", "id": 11, "tags": {"name": "Some Hunting Grounds"}, "center": {"lat": 43.0, "lon": -89.0}},
    ]
    out = P.osm_parks("WI", elements, None)
    assert [p["name"] for p in out.values()] == ["Devil's Lake State Park", "Aztalan State Park"]
    assert out["osm_w7"]["camping"] == P.CAMP_NEARBY and out["osm_w9"]["camping"] == P.CAMP_CHECK


def test_a_states_own_list_wins_and_openstreetmap_only_adds_camping():
    source = {"fields": {"name": "N", "type": "T", "url": "U"}, "credit": "Wisconsin DNR", "booking": "https://b"}
    features = [
        {"attributes": {"N": "Devil's Lake State Park", "U": "https://dnr/dl"}, "centroid": {"x": -89.73, "y": 43.42}},
        {
            "attributes": {"N": "Kettle Moraine State Forest-Southern Unit"},
            "geometry": {"rings": [[[-88.6, 42.8], [-88.4, 43.0]]]},
        },
    ]
    official = P.layer_parks("WI", features, source)
    assert official["wi_kettle-moraine-state-forest-southern-unit"]["lat"] == 42.9  # from its outline's box
    mapped = P.osm_parks(
        "WI",
        [
            {
                "type": "way",
                "id": 7,
                "tags": {"name": "Devils Lake State Park"},
                "center": {"lat": 43.42, "lon": -89.73},
            },
            {"type": "node", "id": 10, "lat": 43.43, "lon": -89.72},
            {
                "type": "way",
                "id": 12,
                "tags": {"name": "Wild River State Park"},
                "center": {"lat": 45.53, "lon": -92.73},
            },
        ],
        None,
    )
    merged = P.merge_state(official, mapped)
    assert set(merged) == set(official)  # the Minnesota park across the border is not added
    assert merged["wi_devil-s-lake-state-park"]["camping"] == P.CAMP_NEARBY


def test_changes_are_counted_from_stored_hashes():
    place = P.federal_places([FAC], [{"FacilityID": "1", "AddressStateCode": "WI"}], [])["ridb_1"]
    same = {"ridb_1": content_hash(place), "ridb_9": "old"}
    assert changes(same, {"ridb_1": place, "ridb_2": place}) == {"added": 1, "changed": 0, "removed": 1}
    assert changes({"ridb_1": "different"}, {"ridb_1": place})["changed"] == 1


PAGE = (
    "<html><script>x</script><p>Treks for crews of 7 to 12 people. "
    "Participants must be 14 years old by arrival.</p></html>"
)


def test_high_adventure_facts_are_kept_only_when_the_page_says_them():
    answer = {
        "summary": "Treks for crews of 7 to 12 people.",
        "facts": [
            {"label": "crewSize", "value": "7-12", "quote": "crews of 7 to 12 people"},
            {"label": "ages", "value": "13+", "quote": "Participants must be 13 years old"},  # not what the page says
            {"label": "cost", "value": "$5", "quote": "short"},
        ],
    }
    place = ha.read_base("ha_philmont", lambda _url: PAGE, lambda _prompt: answer, "2026-11-01")
    assert [f["label"] for f in place["facts"]] == ["crewSize"]
    assert place["description"] == "Treks for crews of 7 to 12 people." and place["checkedOn"] == "2026-11-01"
    invented = ha.read_base(
        "ha_philmont", lambda _u: PAGE, lambda _p: {"summary": "Free pony rides daily for everyone", "facts": []}, "d"
    )
    assert invented["description"] == ""
    broken = ha.read_base("ha_summit", lambda _u: (_ for _ in ()).throw(OSError()), lambda _p: {}, "d")
    assert broken["facts"] == [] and broken["checkedOn"] is None and broken["url"].startswith("https://")


def fake_deps(saved, failing=()):
    def overpass(state):
        if state in failing:
            raise OSError("busy")
        return [
            {
                "type": "way",
                "id": sorted(NAMES).index(state),
                "tags": {"name": f"{state} Test State Park"},
                "center": {"lat": 40.0, "lon": -90.0},
            }
        ]

    return {
        "ridb": lambda: ([FAC], [{"FacilityID": "1", "AddressStateCode": "WI"}], []),
        "overpass": overpass,
        "layer": lambda state: [],
        "page": lambda url: PAGE,
        "ask": lambda prompt: {"summary": "", "facts": []},
        "save": lambda new, old: saved.update(new) or changes(old, new),
        "stored": lambda source, state: {},
        "pause": lambda seconds: None,
    }


def test_a_run_goes_federal_then_each_state_then_high_adventure():
    saved = {}
    run = job.advance(job.new_run(None), fake_deps(saved), time.monotonic() + 60, "2026-11-01")
    assert run["stage"] == "done" and run["statesLeft"] == []
    assert "ridb_1" in saved and "ha_philmont" in saved and any(k.startswith("osm_") for k in saved)
    assert run["counts"]["added"] == len(saved)


def test_a_busy_source_is_tried_again_later_then_skipped():
    saved = {}
    run = job.advance(job.new_run(None), fake_deps(saved, failing={"AK"}), time.monotonic() + 60, "d")
    assert run["stage"] == "states" and run["statesLeft"][0] == "AK" and run["tries"] == {"AK": 1}
    for _ in range(job.MAX_TRIES):
        run = job.advance(run, fake_deps(saved, failing={"AK"}), time.monotonic() + 60, "d")
    assert run["stage"] == "done"


def test_a_run_is_due_after_six_months_or_while_one_is_under_way():
    from datetime import UTC, datetime, timedelta

    now = datetime(2026, 11, 1, tzinfo=UTC)
    assert job.due(None, None, now)
    assert not job.due({"finishedAt": now - timedelta(days=30)}, {"stage": "done"}, now)
    assert job.due({"finishedAt": now - timedelta(days=200)}, {"stage": "done"}, now)
    assert job.due({"finishedAt": now}, {"stage": "states"}, now)


def test_places_are_ranked_nearest_first_and_clearly_too_far_ones_left_out():
    home = (43.07, -89.40)  # Madison
    places = {
        "a": {"name": "Far", "lat": 46.5, "lng": -90.5, "kind": "statePark"},
        "b": {"name": "Near", "lat": 43.42, "lng": -89.73, "kind": "statePark"},
        "c": {"name": "Base", "lat": 36.5, "lng": -104.9, "kind": "highAdventure"},
    }
    rows = find.rank(find.nearby_kinds(places), home, 120, 10)
    assert [r["name"] for r in rows] == ["Near"]  # about 245 miles is well past a two-hour drive
    assert [r["name"] for r in find.rank(places, None, None, 10)] == ["Base", "Far", "Near"]
    assert find.with_drive_times(rows, [3600.0])[0]["driveMinutes"] == 60
    assert find.with_drive_times(rows, [None])[0]["driveMinutes"] is None
