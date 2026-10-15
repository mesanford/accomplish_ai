"""The Scoutmaster role: the role lists, the last-manager guard and the one-off migration's planning."""

import importlib.util
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

from handlers.account import BADGE_MANAGER_ROLES, LEADER_ROLES, is_last_leader
from handlers.email_recipients import badge_manager_uids
from handlers.membership import ROLES, YPT_ROLES
from handlers.roles import ADULT_ROLES, loses_all_badge_managers, loses_all_leaders, parse_roles, ypt_blocker
from trailhead_core.catalog import CUSTOM_AWARD_PREFIX

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("migrate_scoutmaster", ROOT / "scripts" / "migrate_scoutmaster.py")
migrate = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = migrate
spec.loader.exec_module(migrate)


def test_the_scoutmaster_is_a_leader_who_needs_training_and_can_be_picked_on_the_roster():
    assert "scoutmaster" in LEADER_ROLES and "scoutmaster" in YPT_ROLES and "scoutmaster" in ADULT_ROLES
    assert ROLES.index("leader") < ROLES.index("scoutmaster") < ROLES.index("advancement")
    assert parse_roles(["advancement", "scoutmaster", "leader"]) == ["leader", "scoutmaster", "advancement"]
    assert {"scoutmaster", "advancement"} == BADGE_MANAGER_ROLES
    assert "Youth Protection" in ypt_blocker({"scoutmaster"}, None, "Pat", datetime(2026, 10, 15).date())


def test_a_lone_scoutmaster_counts_as_the_last_leader():
    assert is_last_leader("a", {"roles": ["scoutmaster"]}, {}, ["s1"]) is True
    assert is_last_leader("a", {"roles": ["scoutmaster"]}, {"b": {"roles": ["scoutmaster"]}}, ["s1"]) is False
    logins = {"a": {"roles": ["scoutmaster"]}}
    assert loses_all_leaders("a", ["parent"], logins) is True


def test_a_troop_keeps_a_scoutmaster_or_advancement_chair_once_it_has_one():
    logins = {"sm": {"roles": ["leader", "scoutmaster"]}, "asst": {"roles": ["leader"]}, "mom": {"roles": ["parent"]}}
    assert loses_all_badge_managers("sm", ["leader"], logins) is True
    assert loses_all_badge_managers("sm", ["scoutmaster"], logins) is False
    assert loses_all_badge_managers("asst", ["leader", "scoutmaster"], logins) is False
    assert loses_all_badge_managers("mom", ["parent", "counselor"], logins) is False
    # Another Scoutmaster or an advancement chair is enough.
    assert loses_all_badge_managers("sm", ["leader"], {**logins, "chair": {"roles": ["advancement"]}}) is False
    assert loses_all_badge_managers("sm", ["leader"], {**logins, "sm2": {"roles": ["scoutmaster"]}}) is False
    # A troop that has neither yet is not blocked from changing roles.
    assert loses_all_badge_managers("asst", ["parent"], {"asst": {"roles": ["leader"]}}) is False


def test_request_emails_go_to_scoutmasters_and_advancement_chairs_only():
    access = {
        "asst": {"roles": ["leader"]},
        "sm": {"roles": ["leader", "scoutmaster"]},
        "chair": {"roles": ["advancement"]},
        "mbc": {"roles": ["counselor"]},
    }
    assert badge_manager_uids(access) == ["chair", "sm"]


def test_the_rules_list_every_rank_so_rank_signoffs_stay_open_to_leaders():
    rules = (ROOT / "firestore.rules").read_text()
    listed = re.search(r"function isRankOrTroopAward\(awardId\) \{\s*return awardId in \[([^\]]*)\]", rules)
    assert listed, "isRankOrTroopAward not found in firestore.rules"
    in_rules = set(re.findall(r"'([^']+)'", listed.group(1)))
    ranks = json.loads((ROOT / "functions" / "trailhead_core" / "content" / "ranks.json").read_text())["ranks"]
    assert in_rules == {r["id"] for r in ranks}
    assert "custom-.*" in rules  # troop-made awards: trailhead_core.catalog.CUSTOM_AWARD_PREFIX
    assert CUSTOM_AWARD_PREFIX == "custom-"


def at(day: int) -> datetime:
    return datetime(2025, 1, day, tzinfo=UTC)


def test_migration_gives_the_role_to_the_troops_creator():
    logins = {
        "asst": {"roles": ["leader"], "createdAt": at(1)},
        "maker": {"roles": ["leader", "parent"], "createdAt": at(5)},
    }
    change = migrate.plan_troop({"createdBy": "maker"}, logins)
    assert change == migrate.Change("maker", ["leader", "scoutmaster", "parent"], "created the troop")


def test_migration_falls_back_to_the_earliest_leader_when_the_creator_is_unknown_or_gone():
    logins = {
        "late": {"roles": ["leader"], "createdAt": at(9)},
        "early": {"roles": ["advancement"], "createdAt": at(2)},
        "mom": {"roles": ["parent"], "createdAt": at(1)},
    }
    for troop in ({}, {"createdBy": "gone"}, {"createdBy": "mom"}):
        change = migrate.plan_troop(troop, logins)
        assert change == migrate.Change("early", ["scoutmaster", "advancement"], "first leader")


def test_migration_skips_troops_that_have_a_scoutmaster_or_no_leader_and_is_safe_to_rerun():
    assert migrate.plan_troop({"createdBy": "a"}, {"a": {"roles": ["leader", "scoutmaster"]}}) is None
    assert migrate.plan_troop({"createdBy": "a"}, {"a": {"roles": ["parent"]}}) is None
    logins = {"a": {"roles": ["leader"]}}
    first = migrate.plan_troop({"createdBy": "a"}, logins)
    again = migrate.plan_troop({"createdBy": "a"}, {"a": {"roles": first.roles}})
    assert again is None


def test_migration_handles_a_creator_with_no_creation_times():
    logins = {"b": {"roles": ["leader"]}, "a": {"roles": ["leader"]}}
    assert migrate.plan_troop({}, logins).uid == "a"  # ties break by id
