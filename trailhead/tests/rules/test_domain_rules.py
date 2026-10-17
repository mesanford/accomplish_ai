"""Custom domains: `domains/{host}` is server-only; `troops/{t}/site/domain` is leader-read and never client-written."""

from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
HOST = "domains/troop101.org"
MIRROR = f"{T}/site/domain"
DOMAIN = {"troopId": "t1", "slug": "troop-123", "status": "live", "records": []}
STATE = {"host": "troop101.org", "status": "waiting_dns", "records": [], "steps": []}


def test_the_host_lookup_is_invisible_and_unwritable_for_every_client():
    assert Client("owner").set(HOST, DOMAIN) == OK
    for uid in ("leader", "assistant", "parent", "scout1", "counselor", "stranger", None):
        assert Client(uid).get(HOST) == DENIED
        assert Client(uid).set(HOST, DOMAIN) == DENIED
        assert Client(uid).set("domains/troop999.org", {**DOMAIN, "troopId": "t9"}) == DENIED
        assert Client(uid).delete(HOST) == DENIED


def test_a_leader_cannot_claim_or_change_a_domain_from_the_app():
    leader = Client("leader")
    assert leader.set("domains/mine.org", DOMAIN) == DENIED
    assert Client("owner").set(HOST, DOMAIN) == OK
    assert leader.set(HOST, {**DOMAIN, "troopId": "t1", "status": "live", "slug": "someone-elses"}) == DENIED
    assert leader.delete(HOST) == DENIED


def test_only_leaders_read_the_domain_status_and_nobody_writes_it():
    assert Client("owner").set(MIRROR, STATE) == OK
    for uid in ("leader", "assistant", "chair"):  # the advancement chair counts as a leader
        assert Client(uid).get(MIRROR) == OK
    for uid in ("parent", "scout1", "counselor", "stranger", None):
        assert Client(uid).get(MIRROR) == DENIED
    for uid in ("leader", "assistant", "parent", "stranger", None):
        assert Client(uid).set(MIRROR, {**STATE, "status": "live"}) == DENIED
        assert Client(uid).delete(MIRROR) == DENIED


def test_a_leader_of_another_troop_cannot_read_it():
    from .emulator import Client as C

    C("owner").set("troops/t2/access/leader2", {"memberId": "m-l2", "roles": ["leader"], "scoutIds": []})
    assert C("owner").set(MIRROR, STATE) == OK
    assert C("leader2").get(MIRROR) == DENIED
