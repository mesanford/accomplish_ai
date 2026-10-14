from .conftest import T
from .emulator import Client

OK, DENIED = 200, 403
PATH = f"{T}/usage/parent_2026-10-13"


def test_assistant_usage_counters_are_server_only():
    assert Client("owner").set(PATH, {"uid": "parent", "count": 1}) == OK
    for uid in ("parent", "leader", "scout1"):
        assert Client(uid).get(PATH) == DENIED
        assert Client(uid).set(PATH, {"uid": uid, "count": 0}) == DENIED
