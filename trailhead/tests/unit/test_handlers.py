from datetime import date

from handlers.attendance import attendance_effects, mark_ready
from handlers.messaging import participant_uids, people_from_members
from handlers.paths import needs_recheck, path_from_doc, scout_from_docs
from handlers.signoffs import apply_signoff

SIGNOFF = {"scoutId": "s1", "awardId": "camping", "versionId": "v1", "reqId": "3"}


def test_first_signoff_creates_progress():
    out = apply_signoff("so1", SIGNOFF, None)
    assert out.accepted
    assert out.progress["requirements"]["3"] == {"status": "signed", "signoffId": "so1"}


def test_signoff_on_other_version_is_rejected():
    out = apply_signoff("so1", SIGNOFF, {"versionId": "v0", "requirements": {}})
    assert not out.accepted
    assert "v0" in out.reason


def test_signoff_on_complete_award_is_rejected():
    assert not apply_signoff("so1", SIGNOFF, {"versionId": "v1", "status": "complete"}).accepted


def test_attendance_only_counts_present_scouts():
    event = {"logValues": {"nights": 2, "miles": 0}, "linkedRequirements": [{"awardId": "camping", "reqId": "9a"}]}
    assert attendance_effects("e1", event, {"id": "a1", "kind": "adult"}, True).log is None
    assert attendance_effects("e1", event, {"id": "s1", "kind": "scout"}, False).log is None
    fx = attendance_effects("e1", event, {"id": "s1", "kind": "scout"}, True)
    assert fx.log["nights"] == 2
    assert fx.ready == [("camping", "9a")]


def test_mark_ready_never_downgrades_a_signature():
    signed = {"versionId": "v1", "requirements": {"9a": {"status": "signed"}}}
    assert mark_ready(signed, "s1", "camping", "v1", "9a") is None
    assert mark_ready(None, "s1", "camping", "v1", "9a")["requirements"]["9a"] == {"status": "ready"}


def test_recheck_only_when_the_plan_changes():
    doc = {"scoutId": "s1", "goalAwardId": "eagle", "items": [], "feasibility": {"status": "ok"}}
    assert not needs_recheck(doc, {**doc, "title": "My path"})
    assert needs_recheck(doc, {**doc, "targetDate": "2028-01-01"})
    assert needs_recheck(None, {k: v for k, v in doc.items() if k != "feasibility"})
    assert not needs_recheck(doc, None)


def test_documents_convert_to_engine_inputs():
    path = path_from_doc(
        {"scoutId": "s1", "goalAwardId": "star", "items": [{"awardId": "chess", "plannedEnd": "2027-01-05"}]}
    )
    assert path.items[0].planned_end == date(2027, 1, 5)
    scout = scout_from_docs(
        "s1",
        {
            "birthYear": 2012,
            "birthMonth": 5,
            "currentRankId": "first-class",
            "rankDates": {"first-class": "2026-09-01"},
        },
        [
            {"awardId": "chess", "status": "complete", "completedAt": "2026-08-01"},
            {"awardId": "art", "status": "in_progress"},
        ],
    )
    assert scout.earned_badges == {"chess": date(2026, 8, 1)}


def test_guardians_without_logins_are_not_counted():
    members = {
        "s1": {"kind": "scout", "guardianIds": ["p1", "p2"]},
        "p1": {"kind": "adult", "uid": "u-p1"},
        "p2": {"kind": "adult"},
    }
    people = people_from_members(members)
    assert people["s1"].guardian_ids == ("p1",)
    assert participant_uids(["s1", "p1", "p2"], members) == ["u-p1"]


def test_custom_award_rejects_unknown_requirement():
    custom = {**SIGNOFF, "awardId": "custom-abc", "reqId": "zz"}
    assert not apply_signoff("so1", custom, None, ["r1", "r2"]).accepted


def test_signing_the_last_custom_requirement_completes_the_award():
    custom = {**SIGNOFF, "awardId": "custom-abc", "reqId": "r2"}
    progress = {"versionId": "v1", "status": "in_progress", "requirements": {"r1": {"status": "signed"}}}
    out = apply_signoff("so2", custom, progress, ["r1", "r2"], date(2026, 10, 14))
    assert out.progress["status"] == "complete"
    assert out.progress["completedAt"] == "2026-10-14"
    first = apply_signoff("so1", {**custom, "reqId": "r1"}, None, ["r1", "r2"])
    assert first.progress["status"] == "in_progress"
