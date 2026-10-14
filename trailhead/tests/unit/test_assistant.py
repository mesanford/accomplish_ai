from datetime import date, timedelta

import pytest

from handlers.assistant import (
    DAILY_DRAFT_LIMIT,
    clean_response,
    draft_plan,
    usage_doc_id,
    validate_request,
    within_daily_limit,
)
from handlers.assistant_prompt import MAX_REQUEST_CHARS, build_prompt
from handlers.fake_planner import fake_plan
from trailhead_core import ScoutRecord, load_catalog

TODAY = date(2026, 10, 13)
CATALOG = load_catalog()
SCOUT = ScoutRecord(
    scout_id="s1",
    birth_year=2012,
    birth_month=5,
    current_rank_id="first-class",
    rank_dates={"first-class": date(2026, 9, 1)},
    earned_badges={"camping": date(2026, 6, 1)},
)


def test_prompt_has_the_facts_and_marks_the_request_as_data():
    prompt = build_prompt(TODAY, SCOUT, "life", date(2027, 5, 1), "no hiking in winter", CATALOG)
    assert "Today: 2026-10-13" in prompt
    assert "current rank first-class" in prompt
    assert "already earned (do not include): camping" in prompt
    assert "Target date: 2027-05-01" in prompt
    assert "<<<REQUEST\nno hiking in winter\nREQUEST>>>" in prompt
    assert "swimming |" in prompt  # catalog lists id, name, difficulty, time, eagle status, minimum days
    assert "personal-fitness | Personal Fitness" in prompt
    assert "min 84 days" in prompt
    assert "\ncamping |" not in prompt  # earned badges are not offered


def test_unknown_earned_and_duplicate_badges_are_dropped():
    raw = {
        "items": [
            {"awardId": "swimming", "plannedStart": "2026-11-01", "plannedEnd": "2026-12-01"},
            {"awardId": "not-a-badge", "plannedStart": "2026-11-01", "plannedEnd": "2026-12-01"},
            {"awardId": "camping", "plannedStart": "2026-11-01", "plannedEnd": "2026-12-01"},
            {"awardId": "swimming", "plannedStart": "2027-01-01", "plannedEnd": "2027-02-01"},
            "junk",
        ],
        "explanation": "  Start with swimming.  ",
    }
    items, text = clean_response(raw, SCOUT, CATALOG, TODAY)
    assert items == [{"awardId": "swimming", "plannedStart": "2026-11-01", "plannedEnd": "2026-12-01"}]
    assert text == "Start with swimming."


def test_bad_dates_are_handled():
    raw = {
        "items": [
            {"awardId": "swimming", "plannedStart": "soon", "plannedEnd": None},
            {"awardId": "chess", "plannedStart": "2026-12-01", "plannedEnd": "2026-11-01"},
            {"awardId": "cooking", "plannedStart": "2025-01-01", "plannedEnd": "2026-12-01"},
        ]
    }
    items, text = clean_response(raw, SCOUT, CATALOG, TODAY)
    assert items[0] == {"awardId": "swimming", "plannedStart": None, "plannedEnd": None}
    assert items[1] == {"awardId": "chess", "plannedStart": None, "plannedEnd": None}  # end before start
    assert items[2]["plannedStart"] == "2026-10-13"  # past start moved to today
    assert text == ""


@pytest.mark.parametrize("raw", [None, [], "text", {"items": "nope"}, {"items": None, "explanation": 5}])
def test_garbage_responses_become_an_empty_draft(raw):
    assert clean_response(raw, SCOUT, CATALOG, TODAY) == ([], "")


def test_request_validation():
    assert validate_request("  Get me to Life  ") == "Get me to Life"
    for bad in (None, "", "   ", 7, "x" * (MAX_REQUEST_CHARS + 1)):
        with pytest.raises(ValueError):
            validate_request(bad)
    assert validate_request("x" * MAX_REQUEST_CHARS)


def test_rate_limit_logic():
    assert within_daily_limit(0)
    assert within_daily_limit(DAILY_DRAFT_LIMIT - 1)
    assert not within_daily_limit(DAILY_DRAFT_LIMIT)
    assert not within_daily_limit(5, limit=5)
    assert usage_doc_id("u1", TODAY) == "u1_2026-10-13"


def _bad_then_good():
    """A fake model: first an infeasible plan (swimming far too short for Personal Fitness), then a fixed one."""
    calls: list[str] = []
    bad = {
        "items": [{"awardId": "personal-fitness", "plannedStart": "2026-11-01", "plannedEnd": "2026-11-10"}],
        "explanation": "first try",
    }
    good = {
        "items": [{"awardId": "personal-fitness", "plannedStart": "2026-11-01", "plannedEnd": "2027-02-01"}],
        "explanation": "second try",
    }

    def model(prompt: str) -> dict:
        calls.append(prompt)
        return bad if len(calls) == 1 else good

    return model, calls


def test_repair_round_sends_engine_messages_back_and_uses_the_better_plan():
    model, calls = _bad_then_good()
    out = draft_plan(model, SCOUT, "star", None, "fitness please", TODAY, CATALOG)
    assert len(calls) == 2
    assert "needs at least 84 days" in calls[1]
    assert "Previous draft" in calls[1]
    assert out["repaired"] is True
    assert out["explanation"] == "second try"
    assert out["items"][0]["plannedEnd"] == "2027-02-01"
    assert not any(i["code"] == "too_short" for i in out["feasibility"]["issues"])


def test_no_repair_when_first_draft_is_not_infeasible():
    scout = SCOUT.model_copy(update={"earned_badges": {}})
    plan = fake_plan(scout, "star", CATALOG, TODAY)
    calls: list[str] = []

    def model(prompt: str) -> dict:
        calls.append(prompt)
        return plan

    out = draft_plan(model, scout, "star", None, "star please", TODAY, CATALOG)
    assert len(calls) == 1
    assert out["repaired"] is False
    assert out["feasibility"]["status"] != "infeasible"


def test_repair_failure_keeps_first_draft():
    calls = []

    def model(prompt: str) -> dict:
        calls.append(prompt)
        if len(calls) == 2:
            raise RuntimeError("model down")
        return {"items": [{"awardId": "personal-fitness", "plannedStart": "2026-11-01", "plannedEnd": "2026-11-10"}]}

    out = draft_plan(model, SCOUT, "star", None, "x", TODAY, CATALOG)
    assert out["repaired"] is False
    assert out["feasibility"]["status"] == "infeasible"
    assert len(out["items"]) == 1


def test_fake_planner_is_deterministic_and_respects_minimum_days():
    plan = fake_plan(SCOUT, "eagle", CATALOG, TODAY)
    assert plan == fake_plan(SCOUT, "eagle", CATALOG, TODAY)
    ids = [i["awardId"] for i in plan["items"]]
    assert "camping" not in ids
    assert len(ids) == len(set(ids)) == CATALOG.ranks["eagle"].total_badges - 1
    for item in plan["items"]:
        start, end = date.fromisoformat(item["plannedStart"]), date.fromisoformat(item["plannedEnd"])
        assert start >= TODAY
        assert end - start >= timedelta(days=CATALOG.badges[item["awardId"]].min_days or 0)
