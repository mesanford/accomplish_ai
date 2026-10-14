"""Rules for outside counselors, sign-offs made on a counselor's behalf, and photos on blue cards."""

from datetime import UTC, datetime

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
NOW = datetime.now(UTC)
PATH = f"{T}/blueCards/s1_archery"
CARD = {"scoutId": "s1", "awardId": "archery", "versionId": "v1", "status": "approved", "requestedAt": NOW}
OUTSIDE = {**CARD, "status": "counselor_assigned", "counselorName": "Jordan Smith", "counselorEmail": None}

leader, counselor, parent, stranger = Client("leader"), Client("counselor"), Client("parent"), Client("stranger")
owner = Client("owner")


def signoff(signer: str, award: str, **extra) -> dict:
    base = {"scoutId": "s1", "awardId": award, "versionId": "v1", "reqId": "1", "signerUid": signer}
    return {**base, "signedAt": NOW, "status": "pending", **extra}


def test_leader_assigns_an_outside_counselor_by_name():
    assert owner.set(PATH, CARD) == OK
    assert leader.set(PATH, OUTSIDE) == OK
    assert leader.set(PATH, {**OUTSIDE, "counselorEmail": "jordan@example.org"}) == OK


def test_assignment_needs_exactly_one_kind_of_counselor():
    assert owner.set(PATH, CARD) == OK
    assert leader.set(PATH, {**CARD, "status": "counselor_assigned"}) == DENIED
    assert leader.set(PATH, {**CARD, "status": "counselor_assigned", "counselorName": 7}) == DENIED
    both = {**OUTSIDE, "counselorUid": "counselor"}
    assert leader.set(PATH, both) == DENIED
    assert leader.set(PATH, {**OUTSIDE, "counselorUid": "counselor", "counselorName": None}) == OK
    assert parent.set(PATH, OUTSIDE) == DENIED


def test_leader_completes_an_outside_counselor_card_but_not_a_member_counselor_card():
    assert owner.set(PATH, OUTSIDE) == OK
    assert leader.set(PATH, {**OUTSIDE, "status": "complete"}) == OK
    assert owner.set(PATH, {**OUTSIDE, "status": "in_progress"}) == OK
    assert leader.set(PATH, {**OUTSIDE, "status": "complete"}) == OK
    assert parent.set(PATH, {**OUTSIDE, "status": "complete"}) == DENIED

    member = {**CARD, "status": "in_progress", "counselorUid": "counselor"}
    assert owner.set(PATH, member) == OK
    assert leader.set(PATH, {**member, "status": "complete"}) == DENIED
    # Only a card with a counselor name and no counselor login qualifies.
    nobody = {**CARD, "status": "in_progress"}
    assert owner.set(PATH, nobody) == OK
    assert leader.set(PATH, {**nobody, "status": "complete"}) == DENIED


def test_a_leader_cannot_turn_a_card_with_a_member_counselor_into_an_outside_complete():
    member = {**CARD, "status": "in_progress", "counselorUid": "counselor", "counselorName": "Jordan Smith"}
    assert owner.set(PATH, member) == OK
    assert leader.set(PATH, {**member, "status": "complete"}) == DENIED


def test_counselors_cannot_edit_names_or_photos():
    member = {**CARD, "status": "counselor_assigned", "counselorUid": "counselor", "photoPaths": []}
    assert owner.set(PATH, member) == OK
    assert counselor.set(PATH, {**member, "status": "in_progress"}) == OK
    assert counselor.set(PATH, {**member, "status": "complete", "counselorName": "Someone"}) == DENIED
    assert counselor.set(PATH, {**member, "status": "complete", "photoPaths": ["x"]}) == DENIED
    assert counselor.set(PATH, {**member, "status": "complete"}) == OK


def test_only_leaders_set_on_behalf_of_on_signoffs():
    assert Client("leader").create(f"{T}/signoffs/a", signoff("leader", "camping", onBehalfOf="Jordan Smith")) == OK
    assert leader.create(f"{T}/signoffs/b", signoff("leader", "camping", onBehalfOf="")) == DENIED
    assert leader.create(f"{T}/signoffs/c", signoff("leader", "camping", onBehalfOf=5)) == DENIED
    assert leader.create(f"{T}/signoffs/d", signoff("leader", "camping", onBehalfOf="x" * 81)) == DENIED
    own = {**CARD, "status": "in_progress", "counselorUid": "counselor"}
    assert owner.set(f"{T}/blueCards/s1_chess", {**own, "awardId": "chess"}) == OK
    assert counselor.create(f"{T}/signoffs/e", signoff("counselor", "chess")) == OK
    assert counselor.create(f"{T}/signoffs/f", signoff("counselor", "chess", onBehalfOf="Jordan Smith")) == DENIED


def test_leaders_change_photo_paths_alone_in_any_status():
    card = {**OUTSIDE, "photoPaths": []}
    assert owner.set(PATH, card) == OK
    assert leader.set(PATH, {**card, "photoPaths": ["cards/t1/s1/s1_archery/a.png"]}) == OK
    done = {**card, "status": "complete"}
    assert owner.set(PATH, done) == OK
    assert leader.set(PATH, {**done, "photoPaths": ["cards/t1/s1/s1_archery/a.png"]}) == OK
    assert leader.set(PATH, {**done, "photoPaths": "a.png"}) == DENIED
    assert leader.set(PATH, {**done, "photoPaths": ["x"] * 21}) == DENIED
    # Photos can't be bundled with another change.
    assert leader.set(PATH, {**done, "photoPaths": ["a"], "counselorName": "Pat"}) == DENIED
    assert leader.set(PATH, {**done, "photoPaths": ["a"], "status": "cancelled"}) == DENIED
    for other in (parent, stranger, counselor):
        assert other.set(PATH, {**done, "photoPaths": ["a"]}) == DENIED


def test_card_records_cannot_be_rewritten_by_leaders():
    paper = {**OUTSIDE, "source": "paper", "recordedAt": NOW, "status": "in_progress"}
    assert owner.set(PATH, paper) == OK
    assert leader.set(PATH, {**paper, "source": "other", "status": "complete"}) == DENIED
    assert leader.set(PATH, {k: v for k, v in paper.items() if k != "source"} | {"status": "complete"}) == DENIED
    assert leader.set(PATH, {**paper, "status": "complete"}) == OK


def test_the_scouts_family_can_read_the_card_name():
    assert owner.set(PATH, OUTSIDE) == OK
    assert parent.get(PATH) == OK
    assert Client("scout1").get(PATH) == OK
    assert stranger.get(PATH) == DENIED
