"""Event sign-ups: capacity, waitlist promotion, deadlines and the permission rules."""

from datetime import UTC, date, datetime, timedelta

import pytest

from handlers import signups as s
from handlers.signups import SignupError

NOW = datetime(2026, 10, 10, 15, 0, tzinfo=UTC)
TODAY = date(2026, 10, 10)
ZONE = s.troop_zone(None)


def config(**over):
    base = {"enabled": True, "audience": "both", "capacity": 2, "deadline": "2026-10-15", "needsPermission": True}
    return s.read_config({"signups": {**base, **over}})


def scout_record(year=2010):
    return {"birthYear": year, "birthMonth": 1}


MOM = {"memberId": "m-mom", "roles": ["parent"], "scoutIds": ["s1", "s2"]}
LEADER = {"memberId": "m-lead", "roles": ["leader"], "scoutIds": []}
SCOUT = {"memberId": "s1", "roles": ["scout"], "scoutIds": ["s1"]}
ADULT = {"memberId": "m-dad", "roles": ["committee"], "scoutIds": []}
SCOUT_MEMBER = {"kind": "scout"}
ADULT_MEMBER = {"kind": "adult"}


def make(member_id, kind="scout", how="parent", cfg=None, room=True, when=NOW, permission=True):
    cfg = cfg or config()
    member = {"kind": kind}
    return s.new_signup(member_id, member, how, {"memberId": "m-mom", "name": "Jo"}, cfg, {}, room, when, permission)


def test_sign_ups_are_off_unless_enabled():
    assert s.read_config({}) is None
    assert s.read_config({"signups": {"enabled": False}}) is None
    assert s.read_config({"signups": {"enabled": True}})["capacity"] is None


def test_config_is_cleaned():
    cfg = s.read_config(
        {
            "signups": {
                "enabled": True,
                "audience": "pets",
                "capacity": -4,
                "deadline": "not a date",
                "questions": [
                    {"id": "diet", "label": "Dietary needs", "type": "text"},
                    {"id": "Bad Id", "label": "x"},
                    {
                        "id": "size",
                        "label": "T-shirt size",
                        "type": "choice",
                        "choices": ["S", "M", ""],
                        "required": True,
                    },
                    {"id": "diet", "label": "duplicate"},
                    {"id": "empty", "label": "  "},
                ],
            }
        }
    )
    assert cfg["audience"] == "both" and cfg["capacity"] is None and cfg["deadline"] is None
    assert [q["id"] for q in cfg["questions"]] == ["diet", "size"]
    assert cfg["questions"][1]["choices"] == ["S", "M"] and cfg["questions"][1]["required"] is True


def test_capacity_and_waitlist_order():
    cfg = config(capacity=2)
    signups = {}
    for i in ("a", "b", "c", "d"):
        signups[i] = make(
            i, cfg=cfg, room=s.has_room(signups, cfg["capacity"]), when=NOW + timedelta(minutes=len(signups))
        )
    assert [signups[i]["spot"] for i in "abcd"] == ["held", "held", "waitlist", "waitlist"]
    assert s.counts(signups) == {"held": 2, "going": 2, "waitingPermission": 0, "waitlist": 2}


def test_cancelling_promotes_the_first_in_line():
    cfg = config(capacity=2)
    signups = {}
    for n, i in enumerate("abcd"):
        signups[i] = make(i, cfg=cfg, room=s.has_room(signups, 2), when=NOW + timedelta(minutes=n))
    del signups["a"]
    assert s.promote(signups, 2) == ["c"]
    signups["c"] = s.after_promotion(signups["c"])
    assert s.promote(signups, 2) == []
    assert s.status_of(signups["c"]) == "going" and s.status_of(signups["d"]) == "waitlist"


def test_raising_capacity_promotes_several_and_removing_it_promotes_everyone():
    signups = {i: make(i, room=False, when=NOW + timedelta(minutes=n)) for n, i in enumerate("xyz")}
    assert s.promote(signups, 2) == ["x", "y"]
    assert s.promote(signups, None) == ["x", "y", "z"]
    assert s.promote(signups, 0) == []


def test_a_new_person_never_jumps_the_waitlist():
    signups = {"a": make("a", room=False)}
    assert s.has_room(signups, 5) is False  # someone is waiting, so the newcomer waits behind them


def test_a_scout_waiting_for_permission_keeps_their_spot():
    cfg = config(capacity=1)
    pending = make("s1", how="self", cfg=cfg)
    assert pending["spot"] == "held" and s.status_of(pending) == "waiting_permission"
    assert s.has_room({"s1": pending}, 1) is False


def test_deadline_day_is_still_open_the_day_after_is_not():
    cfg, event = config(deadline="2026-10-15"), {"start": "2026-10-20"}
    late_on_day = datetime(2026, 10, 16, 4, 30, tzinfo=UTC)  # 11:30 pm on the 15th in Chicago
    assert s.closed_reason(cfg, event, late_on_day, ZONE) is None
    assert "deadline" in s.closed_reason(cfg, event, datetime(2026, 10, 16, 6, 0, tzinfo=UTC), ZONE)


def test_a_troop_time_zone_changes_when_the_deadline_ends():
    cfg, event = config(deadline="2026-10-15"), {"start": "2026-10-20"}
    moment = datetime(2026, 10, 16, 6, 0, tzinfo=UTC)  # 11 pm on the 15th in Phoenix, past midnight in Eastern
    assert s.closed_reason(cfg, event, moment, s.troop_zone({"timezone": "America/Phoenix"})) is None
    assert s.closed_reason(cfg, event, moment, s.troop_zone({"timezone": "America/New_York"})) is not None
    assert s.troop_zone({"timezone": "Nowhere/Land"}).key == "America/Chicago"


def test_leaders_can_close_sign_ups_early():
    cfg = config(closed=True)
    assert "closed" in s.closed_reason(cfg, {"start": "2026-10-20"}, NOW, ZONE)
    assert s.closed_reason(config(), {"start": "2026-10-20"}, NOW, ZONE) is None


def test_no_deadline_but_the_event_is_over():
    cfg = config(deadline=None)
    assert s.closed_reason(cfg, {"start": "2026-10-10"}, NOW, ZONE) is None
    assert s.closed_reason(cfg, {"start": "2026-10-01"}, NOW, ZONE) == "This event is over."
    assert s.closed_reason(cfg, {"start": "2026-10-01", "endDate": "2026-10-11"}, NOW, ZONE) is None


def test_a_parent_signs_up_their_scout():
    assert s.route(MOM, "s1", SCOUT_MEMBER, scout_record(), config(), TODAY) == "parent"


def test_a_parent_cannot_sign_up_someone_elses_scout_or_an_adult():
    with pytest.raises(SignupError):
        s.route(MOM, "s9", SCOUT_MEMBER, scout_record(), config(), TODAY)
    with pytest.raises(SignupError):
        s.route(MOM, "m-dad", ADULT_MEMBER, None, config(), TODAY)


def test_a_parent_who_has_not_agreed_to_the_notice_cannot_sign_up():
    pending = {**MOM, "consentPendingScoutIds": ["s1"]}
    with pytest.raises(SignupError):
        s.route(pending, "s1", SCOUT_MEMBER, scout_record(), config(), TODAY)


def test_a_scout_signs_themselves_up_only_from_13():
    assert s.route(SCOUT, "s1", SCOUT_MEMBER, scout_record(2010), config(), TODAY) == "self"
    with pytest.raises(SignupError, match="under 13"):
        s.route(SCOUT, "s1", SCOUT_MEMBER, scout_record(2015), config(), TODAY)
    with pytest.raises(SignupError):  # no birth date on file: fail closed
        s.route(SCOUT, "s1", SCOUT_MEMBER, None, config(), TODAY)


def test_an_adult_signs_themselves_up_and_a_leader_can_add_anyone():
    assert s.route(ADULT, "m-dad", ADULT_MEMBER, None, config(), TODAY) == "self"
    with pytest.raises(SignupError):
        s.route(ADULT, "m-other", ADULT_MEMBER, None, config(), TODAY)
    assert s.route(LEADER, "m-other", ADULT_MEMBER, None, config(), TODAY) == "leader"
    assert s.route(LEADER, "s1", SCOUT_MEMBER, scout_record(2016), config(), TODAY) == "leader"


def test_audience_limits_who_can_sign_up():
    with pytest.raises(SignupError, match="Scouts only"):
        s.route(ADULT, "m-dad", ADULT_MEMBER, None, config(audience="scouts"), TODAY)
    with pytest.raises(SignupError, match="adults only"):
        s.route(MOM, "s1", SCOUT_MEMBER, scout_record(), config(audience="adults"), TODAY)
    with pytest.raises(SignupError, match="adults only"):
        s.route(LEADER, "s1", SCOUT_MEMBER, scout_record(), config(audience="adults"), TODAY)


def test_parent_sign_up_counts_as_permission_and_records_who_and_when():
    doc = make("s1", how="parent")
    assert doc["permission"] == {"state": "approved", "byMemberId": "m-mom", "byName": "Jo", "at": NOW}
    assert s.status_of(doc) == "going"


def test_a_parent_must_tick_the_permission_box_when_the_event_needs_it():
    with pytest.raises(SignupError, match="permission"):
        make("s1", how="parent", permission=False)
    assert (
        make("s1", how="parent", cfg=config(needsPermission=False), permission=False)["permission"]["state"]
        == "not_needed"
    )


def test_scout_and_leader_sign_ups_wait_for_a_parent():
    for how in ("self", "leader"):
        doc = make("s1", how=how)
        assert doc["permission"] == {"state": "pending"} and s.status_of(doc) == "waiting_permission"
    assert s.needing_permission({"s1": make("s1", how="self"), "s2": make("s2", how="parent")}) == ["s1"]


def test_adults_never_need_permission():
    assert make("m-dad", kind="adult", how="self")["permission"] == {"state": "not_needed"}


def test_a_parent_approval_records_who_and_when_and_moves_to_going():
    pending = make("s1", how="self")
    later = NOW + timedelta(hours=2)
    approved = s.with_permission(pending, {"memberId": "m-mom", "name": "Jo"}, later)
    assert approved["permission"]["byMemberId"] == "m-mom" and approved["permission"]["at"] == later
    assert approved["status"] == "going"


def test_answers_are_checked_against_the_questions():
    cfg = s.read_config(
        {
            "signups": {
                "enabled": True,
                "questions": [
                    {"id": "diet", "label": "Dietary needs"},
                    {"id": "size", "label": "T-shirt size", "type": "choice", "choices": ["S", "M"], "required": True},
                ],
            }
        }
    )
    assert s.clean_answers(cfg, {"size": "M", "diet": "  nuts  ", "extra": "x"}) == {"size": "M", "diet": "nuts"}
    with pytest.raises(SignupError, match="T-shirt size"):
        s.clean_answers(cfg, {"diet": "none"})
    assert s.clean_answers(cfg, {}, enforce_required=False) == {}  # a leader adding someone skips required answers
    with pytest.raises(SignupError, match="choices"):
        s.clean_answers(cfg, {"size": "XXL"})
    assert len(s.clean_answers(cfg, {"size": "S", "diet": "x" * 999})["diet"]) == s.ANSWER_MAX


def test_health_notes_are_capped():
    assert s.clean_note("  asthma, inhaler in the blue bag ") == "asthma, inhaler in the blue bag"
    assert s.clean_note(None) == ""
    with pytest.raises(SignupError):
        s.clean_note("x" * (s.NOTE_MAX + 1))


def test_who_may_cancel():
    assert s.can_cancel(MOM, "s1") and s.can_cancel(LEADER, "s1") and s.can_cancel(SCOUT, "s1")
    assert not s.can_cancel(MOM, "s9") and not s.can_cancel(ADULT, "s1")
    assert s.can_cancel(ADULT, "m-dad")


def test_reminders_are_two_days_ahead():
    assert s.reminder_day(date(2026, 10, 30)) == date(2026, 11, 1)
    assert s.parse_clock("09:30").hour == 9 and s.parse_clock("25:00") is None and s.parse_clock(5) is None
