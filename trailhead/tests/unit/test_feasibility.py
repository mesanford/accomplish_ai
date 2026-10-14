from datetime import date, timedelta

from trailhead_core import Path, PathItem, PathStatus, ScoutRecord, check_path, load_catalog

TODAY = date(2026, 10, 13)

EAGLE_REQUIRED = [
    "camping",
    "citizenship-in-the-community",
    "citizenship-in-the-nation",
    "citizenship-in-the-world",
    "communication",
    "cooking",
    "family-life",
    "first-aid",
    "personal-fitness",
    "personal-management",
    "emergency-preparedness",
    "environmental-science",
    "swimming",
]
ELECTIVES = ["archery", "chess", "art", "astronomy", "basketry", "fingerprinting", "geology", "weather"]


def codes(result):
    return {i.code for i in result.issues}


def first_class_scout(**kw):
    return ScoutRecord(
        scout_id="s1",
        birth_year=2012,
        birth_month=5,
        current_rank_id="first-class",
        rank_dates={"first-class": date(2026, 9, 1)},
        **kw,
    )


def spread(ids, start=date(2026, 11, 1), step_days=30, length_days=95):
    """Plan badges one after another, each long enough for any tracking requirement."""
    items = []
    for n, award in enumerate(ids):
        s = start + timedelta(days=n * step_days)
        items.append(PathItem(award_id=award, order=n, planned_start=s, planned_end=s + timedelta(days=length_days)))
    return items


def test_full_eagle_plan_is_feasible():
    path = Path(scout_id="s1", goal_award_id="eagle", items=spread(EAGLE_REQUIRED + ELECTIVES, step_days=21))
    result = check_path(path, first_class_scout(), TODAY)
    assert "not_enough_badges" not in codes(result)
    assert result.earliest_goal_date is not None
    # Star waits 4 months after First Class, Life 6 after Star, Eagle 6 after Life: at least 16 months.
    assert result.earliest_goal_date >= date(2028, 1, 1)


def test_target_date_too_early_is_infeasible():
    path = Path(
        scout_id="s1",
        goal_award_id="eagle",
        target_date=date(2027, 6, 1),
        items=spread(EAGLE_REQUIRED + ELECTIVES, step_days=7),
    )
    result = check_path(path, first_class_scout(), TODAY)
    assert result.status == PathStatus.INFEASIBLE
    assert "misses_target" in codes(result)


def test_missing_required_badges_are_named():
    path = Path(scout_id="s1", goal_award_id="eagle", items=spread(ELECTIVES))
    result = check_path(path, first_class_scout(), TODAY)
    issue = next(i for i in result.issues if i.code == "not_enough_badges")
    assert "Personal Management" in issue.message
    assert "Emergency Preparedness or Lifesaving" in issue.message


def test_tracking_badge_planned_too_short():
    item = PathItem(award_id="personal-management", planned_start=date(2026, 11, 1), planned_end=date(2026, 12, 15))
    result = check_path(Path(scout_id="s1", goal_award_id="star", items=[item]), first_class_scout(), TODAY)
    assert "too_short" in codes(result)


def test_whitewater_needs_canoeing_or_kayaking_first():
    ww = PathItem(award_id="whitewater", planned_start=date(2026, 11, 1), planned_end=date(2026, 12, 1))
    result = check_path(Path(scout_id="s1", goal_award_id="star", items=[ww]), first_class_scout(), TODAY)
    assert "prerequisite" in codes(result)

    canoe = PathItem(award_id="canoeing", planned_start=date(2026, 9, 1), planned_end=date(2026, 10, 20))
    result = check_path(Path(scout_id="s1", goal_award_id="star", items=[canoe, ww]), first_class_scout(), TODAY)
    assert "prerequisite" not in codes(result)


def test_age_limit_blocks_late_eagle():
    older = ScoutRecord(
        scout_id="s2",
        birth_year=2009,
        birth_month=3,
        current_rank_id="first-class",
        rank_dates={"first-class": date(2026, 9, 1)},
    )
    path = Path(scout_id="s2", goal_award_id="eagle", items=spread(EAGLE_REQUIRED + ELECTIVES, step_days=7))
    result = check_path(path, older, TODAY)
    assert "age_limit" in codes(result)
    assert result.status == PathStatus.INFEASIBLE


def test_earned_badges_count_without_planning():
    earned = {b: date(2026, 6, 1) for b in ["camping", "cooking", "first-aid", "swimming", "chess", "art"]}
    result = check_path(Path(scout_id="s1", goal_award_id="star"), first_class_scout(earned_badges=earned), TODAY)
    assert result.status == PathStatus.OK
    assert result.earliest_goal_date == date(2027, 1, 1)  # four months after First Class


def test_overloaded_weeks_warn():
    heavy = ["backpacking", "bugling", "camping", "cycling"]
    items = [PathItem(award_id=b, planned_start=date(2026, 11, 1), planned_end=date(2027, 3, 1)) for b in heavy]
    result = check_path(Path(scout_id="s1", goal_award_id="star", items=items), first_class_scout(), TODAY)
    assert "overloaded" in codes(result)


def test_next_steps_mention_soon_badges():
    item = PathItem(award_id="chess", planned_start=date(2026, 10, 20), planned_end=date(2026, 11, 20))
    result = check_path(Path(scout_id="s1", goal_award_id="star", items=[item]), first_class_scout(), TODAY)
    assert result.next_steps[0] == "Start Chess by 2026-10-20."


def test_unknown_goal():
    result = check_path(Path(scout_id="s1", goal_award_id="wizard"), first_class_scout(), TODAY, load_catalog())
    assert result.status == PathStatus.INFEASIBLE


def test_undated_badges_are_planned_not_missing():
    items = [PathItem(award_id=b) for b in EAGLE_REQUIRED]
    result = check_path(Path(scout_id="s1", goal_award_id="eagle", items=items), first_class_scout(), TODAY)
    unscheduled = [i for i in result.issues if i.code == "unscheduled"]
    assert len(unscheduled) == 1
    assert unscheduled[0].message.startswith("13 badges have no planned finish date")
    short = next(i for i in result.issues if i.code == "not_enough_badges")
    assert "the plan has 13." in short.message
    assert "Missing" not in short.message
    assert "Add finish dates" in short.message
