from trailhead_core.plan_checks import (
    ACKNOWLEDGED,
    FAIL,
    PASS,
    UNKNOWN,
    blockers,
    check_intent,
    health_level,
    load_rules,
    trip_hours,
)

RULES = load_rules()


def plan(**over) -> dict:
    base = {
        "segments": [{"start": "2026-11-13", "endDate": "2026-11-15"}],
        "headcount": {"scouts": 10, "adults": 3},
        "staffing": {"adultMemberIds": ["a1", "a2"], "transport": "families"},
    }
    return {**base, **over}


def by_id(results: list[dict]) -> dict:
    return {r["id"]: r for r in results}


def test_trip_hours_counts_whole_days_without_times_and_exact_hours_with_them():
    assert trip_hours({"start": "2026-11-13", "endDate": "2026-11-15"}) == 48
    assert trip_hours({"start": "2026-11-13"}) == 0
    seg = {"start": "2026-11-13", "endDate": "2026-11-15", "startTime": "18:00", "endTime": "12:00"}
    assert trip_hours(seg) == 42
    assert trip_hours({"start": "soon"}) is None


def test_part_c_past_72_hours_asks_to_confirm_at_exactly_72_and_follows_the_planner():
    assert health_level({"start": "2026-11-13", "endDate": "2026-11-15"}) == ("ab", False)
    assert health_level({"start": "2026-07-05", "endDate": "2026-07-11"}) == ("abc", False)
    assert health_level({"start": "2026-11-13", "endDate": "2026-11-16"}) == ("abc", True)
    assert health_level({"start": "2026-11-13", "endDate": "2026-11-16", "healthConfirmed": True}) == ("abc", False)
    assert health_level({"start": "2026-11-13", "partC": True}) == ("abc", False)


def test_a_complete_weekend_plan_passes_every_check():
    results = check_intent(plan(), {}, RULES)
    assert [r["status"] for r in results] == [PASS, PASS, PASS]
    assert blockers(results) == []
    assert all(r["text"] and r["sourceUrl"].startswith("https://") for r in results)


def test_missing_dates_and_transport_are_unknown_never_a_pass():
    results = by_id(check_intent(plan(segments=[{}], staffing={"adultMemberIds": ["a1", "a2"]}), {}, RULES))
    assert results["health_c"]["status"] == UNKNOWN
    assert results["transport"]["status"] == UNKNOWN


def test_two_deep_needs_two_planned_adults():
    assert by_id(check_intent(plan(staffing={"adultMemberIds": ["a1"]}), {}, RULES))["two_deep"]["status"] == FAIL
    from_signups = plan(staffing={"adultMemberIds": [], "adultsFromSignups": True, "transport": "none"})
    assert by_id(check_intent(from_signups, {}, RULES))["two_deep"]["status"] == UNKNOWN


def test_carpool_checks_seats_drive_time_and_attestations():
    drivers = [{"memberId": "a1", "seats": 4}, {"memberId": "a2", "seats": 4}]
    staffing = {"adultMemberIds": ["a1", "a2"], "transport": "carpool", "drivers": drivers}
    # 13 people, 2 of them driving: 11 riders for 8 seats.
    assert by_id(check_intent(plan(staffing=staffing), {}, RULES))["transport"]["status"] == FAIL
    small = plan(staffing=staffing, headcount={"scouts": 5, "adults": 2})
    assert by_id(check_intent(small, {}, RULES))["transport"]["status"] == UNKNOWN  # no attestation yet
    attested = {**staffing, "attest": {"licensed": True, "seatBelts": True}}
    assert (
        by_id(check_intent(plan(staffing=attested, headcount={"scouts": 5, "adults": 2}), {}, RULES))["transport"][
            "status"
        ]
        == PASS
    )
    long_day = {**attested, "driveMinutes": 601}
    result = by_id(check_intent(plan(staffing=long_day, headcount={"scouts": 5, "adults": 2}), {}, RULES))
    assert result["transport"]["status"] == FAIL


def test_an_acknowledgement_turns_a_failing_check_into_acknowledged_and_unblocks_publishing():
    lonely = plan(staffing={"adultMemberIds": ["a1"], "transport": "none"})
    assert blockers(check_intent(lonely, {}, RULES)) == ["Two-deep adult leadership"]
    acks = {"two_deep": {"byMemberId": "m-leader", "note": "Second adult joins from the district."}}
    results = by_id(check_intent(lonely, acks, RULES))
    assert results["two_deep"]["status"] == ACKNOWLEDGED
    assert results["two_deep"]["ack"]["note"].startswith("Second adult")
    assert blockers(list(results.values())) == []


def test_an_acknowledgement_does_not_change_a_passing_check():
    results = by_id(check_intent(plan(), {"two_deep": {"note": "n"}}, RULES))
    assert results["two_deep"]["status"] == PASS
    assert "ack" not in results["two_deep"]
