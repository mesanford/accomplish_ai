from datetime import UTC, datetime

import pytest

from handlers.membership import InvalidInput
from handlers.scoutbook import build_report, check_entered_request, nothing_new_message, row_keys
from trailhead_core import load_catalog

CATALOG = load_catalog()
NOW = datetime(2026, 10, 13, 12, tzinfo=UTC)
SINCE = datetime(2026, 9, 1, 9, tzinfo=UTC)
MEMBERS = {
    "s1": {"kind": "scout", "displayName": "Sam"},
    "s2": {"kind": "scout", "displayName": "Alex"},
    "m1": {"kind": "adult", "displayName": "Pat Leader", "uid": "u1"},
}


def signoff(scout="s1", award="camping", req="1", when=datetime(2026, 9, 10, 10, tzinfo=UTC), status="accepted"):
    return {
        "scoutId": scout,
        "awardId": award,
        "reqId": req,
        "signerUid": "u1",
        "signedAt": when,
        "status": status,
    }


def report(signoffs=(), progress=(), records=None, since=SINCE, already=None):
    return build_report(list(signoffs), list(progress), records or {}, MEMBERS, CATALOG, since, NOW, already)


def test_only_accepted_signoffs_after_since_are_included():
    rows = report(
        [
            signoff(req="1"),
            signoff(req="2", status="pending"),
            signoff(req="3", status="rejected"),
            signoff(req="4", when=datetime(2026, 8, 30, tzinfo=UTC)),
        ]
    )
    assert [r["requirement"] for r in rows] == ["1"]
    assert rows[0] == {
        "scoutId": "s1",
        "scoutName": "Sam",
        "kind": "requirement",
        "awardId": "camping",
        "awardName": "Camping",
        "requirement": "1",
        "date": "2026-09-10",
        "signedBy": "Pat Leader",
    }


def test_first_report_includes_everything():
    rows = report([signoff(when=datetime(2020, 1, 1, tzinfo=UTC))], since=None)
    assert len(rows) == 1


def test_completed_badges_and_ranks_use_their_dates():
    rows = report(
        progress=[
            {"scoutId": "s1", "awardId": "camping", "status": "complete", "completedAt": "2026-09-20"},
            {"scoutId": "s1", "awardId": "chess", "status": "in_progress"},
            {"scoutId": "s1", "awardId": "art", "status": "complete", "completedAt": "2026-08-01"},
        ],
        records={"s1": {"rankDates": {"first-class": "2026-09-25", "second-class": "2026-05-01"}}},
    )
    assert [(r["kind"], r["awardId"]) for r in rows] == [("merit_badge", "camping"), ("rank", "first-class")]
    assert rows[1]["awardName"] == "First Class"


def test_custom_awards_and_unknown_ranks_are_left_out():
    rows = report(
        [signoff(award="custom-troop-hike")],
        [{"scoutId": "s1", "awardId": "custom-x", "status": "complete", "completedAt": "2026-09-20"}],
        {"s1": {"rankDates": {"custom-rank": "2026-09-25", "mystery": "2026-09-25"}}},
    )
    assert rows == []


def test_rows_are_grouped_by_scout_then_sorted_by_date():
    rows = report(
        [
            signoff(scout="s1", req="2", when=datetime(2026, 9, 12, tzinfo=UTC)),
            signoff(scout="s2", req="1", when=datetime(2026, 9, 11, tzinfo=UTC)),
            signoff(scout="s1", req="1", when=datetime(2026, 9, 10, tzinfo=UTC)),
        ],
        records={"s1": {"rankDates": {"first-class": "2026-09-11"}}},
    )
    assert [(r["scoutName"], r["date"], r["kind"]) for r in rows] == [
        ("Alex", "2026-09-11", "requirement"),
        ("Sam", "2026-09-10", "requirement"),
        ("Sam", "2026-09-11", "rank"),
        ("Sam", "2026-09-12", "requirement"),
    ]


def test_items_already_on_the_last_report_are_not_repeated():
    records = {"s1": {"rankDates": {"first-class": "2026-09-01"}}}
    first = report(records=records, since=None)
    assert len(first) == 1
    assert report(records=records, already=row_keys(first)) == []


def test_future_dates_wait_for_the_next_report():
    assert report(records={"s1": {"rankDates": {"first-class": "2026-12-01"}}}) == []


def test_empty_period_message():
    assert report() == []
    assert nothing_new_message(SINCE) == "Nothing new since Sep 1, 2026."
    assert "yet" in nothing_new_message(None)


def test_entered_request_must_name_a_scout_on_the_report():
    rep = {"rows": [{"scoutId": "s1"}]}
    assert check_entered_request(rep, "s1") == "s1"
    with pytest.raises(InvalidInput, match="isn't on this report"):
        check_entered_request(rep, "s2")
    with pytest.raises(InvalidInput, match="wasn't found"):
        check_entered_request(None, "s1")


def test_advancement_earned_before_trailhead_is_left_out():
    progress = [
        {"scoutId": "s1", "awardId": "chess", "status": "complete", "completedAt": "2026-09-05", "source": "prior"},
        {"scoutId": "s1", "awardId": "art", "status": "complete", "completedAt": "2026-09-06"},
    ]
    records = {
        "s1": {"rankDates": {"tenderfoot": "2026-09-02", "second-class": "2026-09-20"}, "priorRankIds": ["tenderfoot"]}
    }
    rows = report(progress=progress, records=records, since=None)
    assert {r["awardId"] for r in rows} == {"art", "second-class"}
