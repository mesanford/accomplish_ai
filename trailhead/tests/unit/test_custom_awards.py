from datetime import date

import pytest

from handlers.custom_awards import (
    check_award_id,
    clean_award,
    clean_requirements,
    move_progress,
    new_award_id,
    plan_save,
)
from handlers.membership import InvalidInput
from handlers.paths import scout_from_docs
from handlers.signoffs import apply_signoff
from trailhead_core import Path, PathItem, ScoutRecord, check_path

V1 = [
    {"id": "r1", "label": "1", "text": "Attend three troop meetings."},
    {"id": "r2", "label": "2", "text": "Help plan a campout menu."},
    {"id": "r3", "label": "3", "text": "Lead a game."},
]
FORM = {"name": "First-Year Trail", "description": "For new Scouts", "requirements": V1}


def test_award_ids_never_collide_with_the_catalog():
    assert new_award_id().startswith("custom-")
    assert new_award_id() != new_award_id()
    with pytest.raises(InvalidInput):
        check_award_id("camping")


@pytest.mark.parametrize(
    ("form", "message"),
    [
        ({**FORM, "name": " "}, "Award name is required"),
        ({**FORM, "name": "x" * 81}, "80 characters"),
        ({**FORM, "requirements": []}, "at least one requirement"),
        ({**FORM, "requirements": [{"label": "1", "text": ""}]}, "Requirement 1 is required"),
        ({**FORM, "requirements": [{"label": "", "text": "Do it"}]}, "Requirement 1 number is required"),
        ({**FORM, "requirements": [{"label": "1", "text": "a"}, {"label": "1", "text": "b"}]}, "numbered 1"),
    ],
)
def test_invalid_awards_explain_what_to_fix(form, message):
    with pytest.raises(InvalidInput, match=message):
        clean_award(form)


def test_requirement_ids_are_kept_or_generated():
    reqs = clean_requirements([{"id": "r1", "label": "1", "text": "a"}, {"label": "2", "text": "b"}])
    assert reqs[0]["id"] == "r1"
    assert reqs[1]["id"] and reqs[1]["id"] != "r1"
    duplicate = clean_requirements([{"id": "r1", "label": "1", "text": "a"}, {"id": "r1", "label": "2", "text": "b"}])
    assert duplicate[0]["id"] != duplicate[1]["id"]
    assert clean_requirements([{"id": "Bad Id!", "label": "1", "text": "a"}])[0]["id"] != "Bad Id!"


def test_new_award_starts_at_version_one():
    plan = plan_save(clean_award(FORM), None, None, "m1")
    assert plan.version_id == "v1"
    assert plan.award["currentVersionId"] == "v1"
    assert plan.award["archived"] is False
    assert plan.version["requirements"] == V1


def test_name_only_edit_keeps_the_version():
    award = {"name": "Old", "currentVersionId": "v1", "versionCount": 1}
    plan = plan_save(clean_award({**FORM, "name": "Renamed"}), award, V1, "m1")
    assert plan.version_id is None
    assert plan.award == {"name": "Renamed", "description": "For new Scouts"}


def test_requirement_edit_adds_a_version():
    award = {"name": "Old", "currentVersionId": "v2", "versionCount": 2}
    changed = [*V1[:2], {"id": "r3", "label": "3", "text": "Lead two games."}]
    plan = plan_save(clean_award({**FORM, "requirements": changed}), award, V1, "m1")
    assert plan.version_id == "v3"
    assert plan.award["currentVersionId"] == "v3"
    assert "archived" not in plan.award  # editing never un-archives or resets fields


def test_archived_awards_cannot_be_edited():
    with pytest.raises(InvalidInput, match="archived"):
        plan_save(clean_award(FORM), {"archived": True, "currentVersionId": "v1"}, V1, "m1")


def test_move_carries_unchanged_and_flags_reworded():
    v2 = [
        V1[0],
        {"id": "r2", "label": "2", "text": "Plan and cook a campout menu."},
        {"id": "r4", "label": "4", "text": "Teach a knot."},
    ]
    progress = {
        "scoutId": "s1",
        "awardId": "custom-x",
        "versionId": "v1",
        "status": "in_progress",
        "requirements": {
            "r1": {"status": "signed", "signoffId": "so1"},
            "r2": {"status": "signed", "signoffId": "so2"},
            "r3": {"status": "ready"},
        },
    }
    move = move_progress(progress, V1, v2, "v2")
    assert move.progress["versionId"] == "v2"
    assert move.progress["previousVersionId"] == "v1"
    assert move.progress["requirements"] == {"r1": {"status": "signed", "signoffId": "so1"}}
    assert move.progress["needsReview"] == ["r2"]
    assert move.summary == {
        "fromVersionId": "v1",
        "toVersionId": "v2",
        "carried": ["1"],
        "needsReview": ["2"],
        "dropped": ["3"],
    }


@pytest.mark.parametrize(
    ("progress", "message"),
    [
        (None, "hasn't started"),
        ({"versionId": "v1", "status": "complete"}, "already complete"),
        ({"versionId": "v2", "status": "in_progress"}, "already on the latest"),
    ],
)
def test_move_refuses_what_it_cannot_do(progress, message):
    with pytest.raises(InvalidInput, match=message):
        move_progress(progress, V1, V1, "v2")


def test_signing_a_flagged_requirement_settles_the_review():
    progress = {"versionId": "v2", "status": "in_progress", "requirements": {}, "needsReview": ["r2", "r5"]}
    signoff = {"scoutId": "s1", "awardId": "custom-x", "versionId": "v2", "reqId": "r2"}
    out = apply_signoff("so9", signoff, progress)
    assert out.progress["needsReview"] == ["r5"]


def test_path_checker_knows_custom_awards_but_does_not_count_them():
    scout = ScoutRecord(scout_id="s1", birth_year=2012, birth_month=5, current_rank_id="first-class")
    path = Path(scout_id="s1", goal_award_id="star", items=[PathItem(award_id="custom-abc123")])
    result = check_path(path, scout, date(2026, 10, 13))
    assert "unknown_award" not in {i.code for i in result.issues}
    assert any(i.code == "not_enough_badges" and "the plan has 0" in i.message for i in result.issues)
    unknown = check_path(
        Path(scout_id="s1", goal_award_id="star", items=[PathItem(award_id="nope")]), scout, date.today()
    )
    assert "unknown_award" in {i.code for i in unknown.issues}


def test_completed_custom_awards_are_not_earned_merit_badges():
    record = {"birthYear": 2012, "birthMonth": 5}
    docs = [{"awardId": "custom-abc", "status": "complete", "completedAt": "2026-08-01"}]
    assert scout_from_docs("s1", record, docs).earned_badges == {}
