from datetime import UTC, datetime

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
NOW = datetime.now(UTC)

leader, lapsed, counselor = Client("leader"), Client("lapsed"), Client("counselor")
parent, scout1, stranger = Client("parent"), Client("scout1"), Client("stranger")


def signoff(signer: str, award: str = "chess", scout: str = "s1") -> dict:
    return {
        "scoutId": scout,
        "awardId": award,
        "versionId": "v1",
        "reqId": "1",
        "signerUid": signer,
        "signedAt": NOW,
        "status": "pending",
    }


def test_only_members_read_the_troop():
    assert leader.get(T) == OK
    assert stranger.get(T) == DENIED
    assert Client(None).get(T) == DENIED


def test_program_content_is_admin_only():
    assert leader.set("awards/chess", {"name": "Chess"}) == DENIED
    assert Client("admin", admin=True).set("awards/chess", {"name": "Chess"}) == OK
    assert parent.get("awards/chess") == OK


def test_parents_see_only_their_own_scout():
    assert parent.get(f"{T}/progress/s1_camping") == OK
    assert Client("owner").set(f"{T}/progress/s2_camping", {"scoutId": "s2", "awardId": "camping"}) == OK
    assert parent.get(f"{T}/progress/s2_camping") == DENIED


def test_progress_is_server_written():
    assert leader.set(f"{T}/progress/s1_camping", {"scoutId": "s1", "status": "complete"}) == DENIED


def test_leader_signs_off():
    assert leader.create(f"{T}/signoffs/a", signoff("leader", award="camping")) == OK


def test_expired_youth_protection_blocks_signing():
    assert lapsed.create(f"{T}/signoffs/a", signoff("lapsed", award="camping")) == DENIED


def test_cannot_sign_as_someone_else():
    assert leader.create(f"{T}/signoffs/a", signoff("counselor")) == DENIED


def test_counselor_signs_only_assigned_badges():
    assert counselor.create(f"{T}/signoffs/a", signoff("counselor", award="chess")) == OK
    assert counselor.create(f"{T}/signoffs/b", signoff("counselor", award="camping")) == DENIED


def test_signoffs_are_append_only():
    assert leader.create(f"{T}/signoffs/a", signoff("leader", award="camping")) == OK
    assert leader.set(f"{T}/signoffs/a", signoff("leader", award="cooking")) == DENIED
    assert leader.delete(f"{T}/signoffs/a") == DENIED


def test_scouts_cannot_sign_their_own_work():
    assert scout1.create(f"{T}/signoffs/a", signoff("scout1", award="camping")) == DENIED


def test_paths_are_editable_by_family_but_feasibility_is_server_only():
    path = {"scoutId": "s1", "goalAwardId": "eagle", "items": []}
    assert parent.create(f"{T}/paths/p1", path) == OK
    assert scout1.set(f"{T}/paths/p1", {**path, "targetDate": "2028-06-01"}) == OK
    assert scout1.set(f"{T}/paths/p1", {**path, "feasibility": {"status": "ok"}}) == DENIED
    assert parent.create(f"{T}/paths/p2", {**path, "scoutId": "s2"}) == DENIED


def test_blue_card_flow():
    card = {"scoutId": "s1", "awardId": "archery", "versionId": "v1", "status": "requested", "requestedAt": NOW}
    assert parent.create(f"{T}/blueCards/s1_archery", {**card, "status": "approved"}) == DENIED
    assert parent.create(f"{T}/blueCards/wrong_id", card) == DENIED
    assert parent.create(f"{T}/blueCards/s1_archery", card) == OK
    assert parent.set(f"{T}/blueCards/s1_archery", {**card, "status": "approved"}) == DENIED
    assert leader.set(f"{T}/blueCards/s1_archery", {**card, "status": "approved"}) == OK
    assigned = {**card, "status": "counselor_assigned", "counselorUid": "counselor"}
    assert leader.set(f"{T}/blueCards/s1_archery", assigned) == OK
    assert counselor.set(f"{T}/blueCards/s1_archery", {**assigned, "status": "complete"}) == DENIED
    assert counselor.set(f"{T}/blueCards/s1_archery", {**assigned, "status": "in_progress"}) == OK
    assert counselor.set(f"{T}/blueCards/s1_archery", {**assigned, "status": "complete"}) == OK


def test_messages_are_server_only_and_participant_read():
    assert leader.get(f"{T}/threads/th1") == OK
    assert scout1.get(f"{T}/threads/th1") == DENIED
    assert leader.create(f"{T}/threads/th2", {"participantUids": ["leader", "scout1"]}) == DENIED
    assert leader.create(f"{T}/threads/th1/messages/m1", {"body": "hi"}) == DENIED
