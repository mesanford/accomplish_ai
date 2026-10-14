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
    assert parent.get(f"{T}/paths/s1") == 404  # readable before it exists, so the app can show "no plan yet"
    assert parent.create(f"{T}/paths/s1", path) == OK
    assert scout1.set(f"{T}/paths/s1", {**path, "targetDate": "2028-06-01"}) == OK
    assert scout1.set(f"{T}/paths/s1", {**path, "feasibility": {"status": "ok"}}) == DENIED
    assert parent.create(f"{T}/paths/s2", {**path, "scoutId": "s2"}) == DENIED
    assert parent.create(f"{T}/paths/other", path) == DENIED


def template(**changes) -> dict:
    base = {
        "name": "First summer",
        "description": "Camp badges",
        "goalAwardId": "first-class",
        "items": [{"awardId": "swimming", "startOffsetDays": 0, "durationDays": 28}],
        "createdByMemberId": "m-leader",
        "updatedAt": NOW,
        "archived": False,
    }
    return {**base, **changes}


def test_path_templates_are_leader_written_and_troop_read():
    path = f"{T}/pathTemplates/tpl1"
    assert leader.create(path, template()) == OK
    assert parent.get(path) == OK
    assert stranger.get(path) == DENIED
    assert parent.create(f"{T}/pathTemplates/tpl2", template()) == DENIED
    assert scout1.set(path, template(name="Mine")) == DENIED
    assert leader.set(path, template(archived=True)) == OK


def test_path_templates_check_their_shape_and_cannot_be_deleted():
    path = f"{T}/pathTemplates/tpl1"
    assert leader.create(path, template(items="swimming")) == DENIED
    assert leader.create(path, template(goalAwardId=5)) == DENIED
    assert leader.create(path, template(name="")) == DENIED
    assert leader.create(path, template(extra="x")) == DENIED
    missing = template()
    del missing["archived"]
    assert leader.create(path, missing) == DENIED
    assert leader.create(path, template()) == OK
    assert leader.delete(path) == DENIED


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


def test_invites_are_leader_read_and_server_written():
    assert Client("owner").set(f"{T}/invites/abc", {"role": "parent"}) == OK
    assert leader.get(f"{T}/invites/abc") == OK
    assert parent.get(f"{T}/invites/abc") == DENIED
    assert leader.set(f"{T}/invites/xyz", {"role": "leader"}) == DENIED


def test_leader_can_start_a_blue_card_for_a_scout():
    card = {"scoutId": "s2", "awardId": "art", "versionId": "v1", "status": "requested", "requestedAt": NOW}
    assert leader.create(f"{T}/blueCards/s2_art", card) == OK
    assert parent.create(f"{T}/blueCards/s2_cooking", {**card, "awardId": "cooking"}) == DENIED
