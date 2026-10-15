"""Only the Scoutmaster, the advancement chair and a badge's assigned counselor change merit badge records.

In these tests "leader" is the Scoutmaster (roles leader + scoutmaster), "assistant" holds only the leader role and
"chair" is the advancement chair.
"""

from datetime import UTC, datetime

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
NOW = datetime.now(UTC)
PATH = f"{T}/blueCards/s1_archery"
REQUESTED = {"scoutId": "s1", "awardId": "archery", "versionId": "v1", "status": "requested", "requestedAt": NOW}
APPROVED = {**REQUESTED, "status": "approved"}
ASSIGNED = {**REQUESTED, "status": "counselor_assigned", "counselorUid": "counselor"}
OUTSIDE = {**REQUESTED, "status": "in_progress", "counselorName": "Jordan Smith", "photoPaths": []}

owner = Client("owner")
scoutmaster, chair, assistant = Client("leader"), Client("chair"), Client("assistant")
counselor, parent = Client("counselor"), Client("parent")
MANAGERS = [scoutmaster, chair]


def signoff(signer: str, award: str, **extra) -> dict:
    base = {"scoutId": "s1", "awardId": award, "versionId": "v1", "reqId": "1", "signerUid": signer}
    return {**base, "signedAt": NOW, "status": "pending", **extra}


def test_an_assistant_leader_cannot_approve_assign_cancel_or_complete_a_blue_card():
    assert owner.set(PATH, REQUESTED) == OK
    assert assistant.set(PATH, APPROVED) == DENIED
    assert assistant.set(PATH, {**REQUESTED, "status": "cancelled"}) == DENIED
    assert owner.set(PATH, APPROVED) == OK
    assert assistant.set(PATH, ASSIGNED) == DENIED
    assert assistant.set(PATH, {**APPROVED, "status": "counselor_assigned", "counselorName": "Jordan Smith"}) == DENIED
    assert owner.set(PATH, {**OUTSIDE, "status": "counselor_assigned"}) == OK
    assert assistant.set(PATH, {**OUTSIDE, "status": "complete"}) == DENIED


def test_an_assistant_leader_cannot_add_card_photos():
    assert owner.set(PATH, OUTSIDE) == OK
    assert assistant.set(PATH, {**OUTSIDE, "photoPaths": ["cards/t1/s1/s1_archery/a.png"]}) == DENIED


def test_an_assistant_leader_cannot_start_a_card_but_a_parent_can_request_one_for_their_scout():
    assert assistant.create(PATH, REQUESTED) == DENIED
    assert parent.create(PATH, REQUESTED) == OK


def test_an_assistant_leader_still_reads_cards_and_progress():
    assert owner.set(PATH, REQUESTED) == OK
    assert assistant.get(PATH) == OK
    assert assistant.get(f"{T}/progress/s1_camping") == OK


def test_the_scoutmaster_and_the_advancement_chair_run_a_card_from_start_to_finish():
    for i, who in enumerate(MANAGERS):
        path = f"{T}/blueCards/s1_card{i}"
        card = {**REQUESTED, "awardId": f"card{i}"}
        assert who.create(path, card) == OK
        assert who.set(path, {**card, "status": "approved"}) == OK
        assert who.set(path, {**card, "status": "counselor_assigned", "counselorName": "Jordan Smith"}) == OK
        done = {**card, "status": "complete", "counselorName": "Jordan Smith"}
        assert who.set(path, done) == OK
        assert who.set(path, {**done, "photoPaths": ["cards/t1/s1/s1_card/a.png"]}) == OK
    assert chair.set(f"{T}/blueCards/s1_cancel", {**REQUESTED, "awardId": "cancel", "status": "requested"}) == OK
    assert scoutmaster.set(f"{T}/blueCards/s1_cancel", {**REQUESTED, "awardId": "cancel", "status": "cancelled"}) == OK


def test_only_managers_sign_merit_badge_requirements_except_the_assigned_counselor():
    assert assistant.create(f"{T}/signoffs/a", signoff("assistant", "camping")) == DENIED
    assert assistant.create(f"{T}/signoffs/b", signoff("assistant", "camping", onBehalfOf="Jordan Smith")) == DENIED
    assert scoutmaster.create(f"{T}/signoffs/c", signoff("leader", "camping")) == OK
    assert chair.create(f"{T}/signoffs/d", signoff("chair", "camping")) == OK
    assert counselor.create(f"{T}/signoffs/e", signoff("counselor", "chess")) == OK  # the card's assigned counselor
    assert counselor.create(f"{T}/signoffs/f", signoff("counselor", "camping")) == DENIED  # someone else's badge


def test_a_badge_that_is_not_a_rank_or_troop_award_counts_as_a_merit_badge():
    # Even an id the app has never heard of is treated as a merit badge, so the rule fails closed.
    assert assistant.create(f"{T}/signoffs/a", signoff("assistant", "not-a-real-badge")) == DENIED
    assert assistant.create(f"{T}/signoffs/b", signoff("assistant", "custom")) == DENIED  # "custom-" prefix only
    assert scoutmaster.create(f"{T}/signoffs/c", signoff("leader", "not-a-real-badge")) == OK


def test_an_assistant_leader_still_signs_ranks_and_troop_awards():
    for i, award in enumerate(["scout", "tenderfoot", "second-class", "first-class", "star", "life", "eagle"]):
        assert assistant.create(f"{T}/signoffs/r{i}", signoff("assistant", award)) == OK
    assert assistant.create(f"{T}/signoffs/c1", signoff("assistant", "custom-knots")) == OK
    assert assistant.create(f"{T}/signoffs/c2", signoff("assistant", "custom-knots", onBehalfOf="Pat")) == OK


def test_a_counselor_cannot_sign_a_rank():
    assert counselor.create(f"{T}/signoffs/a", signoff("counselor", "first-class")) == DENIED


def test_a_manager_with_expired_training_still_cannot_sign():
    lapsed = Client("lapsed")
    assert lapsed.create(f"{T}/signoffs/a", signoff("lapsed", "camping")) == DENIED
    assert lapsed.create(f"{T}/signoffs/b", signoff("lapsed", "first-class")) == DENIED
