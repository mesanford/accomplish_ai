import re
from pathlib import Path

from handlers.consent import CONSENT_NOTICE_VERSION
from handlers.consent_kinds import (
    DATA_KINDS,
    HOLD_MESSAGE,
    UPDATED_REASON,
    blocked_kinds,
    is_held,
    kind_blocker,
    latest_parent_version,
)

SCOUT = {"kind": "scout", "displayName": "Ava"}


def consented(*versions: str) -> dict:
    return {"parentConsents": [{"uid": f"u{i}", "memberId": f"m{i}", "version": v} for i, v in enumerate(versions)]}


def test_every_kind_was_added_by_a_version_that_exists_and_is_not_in_the_future():
    assert set(DATA_KINDS) == {"accounts", "health", "patrols", "activity", "equipment", "healthForms"}
    for added in DATA_KINDS.values():
        assert added <= CONSENT_NOTICE_VERSION


def test_the_python_and_app_maps_match():
    source = Path(__file__).parents[2].joinpath("app/src/lib/consentChangelog.ts").read_text()
    block = source.split("export const DATA_KINDS_ADDED", 1)[1].split("};", 1)[0]
    assert dict(re.findall(r"(\w+): '([\d.\-]+)'", block)) == DATA_KINDS


def test_a_parent_who_agreed_before_a_kind_was_added_blocks_that_kind():
    assert blocked_kinds(consented("2026-10-15.3")) == [
        "accounts",
        "activity",
        "equipment",
        "health",
        "healthForms",
        "patrols",
    ]
    assert blocked_kinds(consented("2026-10-16.1")) == [
        "activity",
        "equipment",
        "healthForms",
        "patrols",
    ]  # accounts and health ok
    assert blocked_kinds(consented("2026-10-17.1")) == ["healthForms"]
    assert blocked_kinds(consented("2026-10-18.1")) == []


def test_the_newest_parent_consent_counts_so_one_current_parent_lifts_the_block():
    assert latest_parent_version(consented("2026-10-15.3", "2026-10-18.1")) == "2026-10-18.1"
    assert blocked_kinds(consented("2026-10-15.3", "2026-10-18.1")) == []


def test_no_parent_consent_on_record_blocks_no_kind_here():
    assert blocked_kinds(None) == [] and blocked_kinds({}) == []
    assert blocked_kinds({"parentConsents": []}) == []


def test_kind_blocker_gives_a_plain_reason():
    old = consented("2026-10-16.1")
    assert (
        kind_blocker(SCOUT, old, "equipment")
        == UPDATED_REASON
        == "Waiting for a parent to agree to the updated notice."
    )
    assert kind_blocker(SCOUT, old, "accounts") is None
    assert kind_blocker(SCOUT, consented(CONSENT_NOTICE_VERSION), "equipment") is None
    assert kind_blocker({"kind": "adult"}, old, "equipment") is None  # only Scouts are held back


def test_a_scout_waiting_for_a_first_consent_is_blocked_for_every_kind():
    held = {**SCOUT, "consentHold": True}
    assert (
        is_held(held)
        and not is_held(SCOUT)
        and not is_held(None)
        and not is_held({"kind": "adult", "consentHold": True})
    )
    for kind in DATA_KINDS:
        assert kind_blocker(held, None, kind) == HOLD_MESSAGE
        assert kind_blocker(held, consented(CONSENT_NOTICE_VERSION), kind) == HOLD_MESSAGE
