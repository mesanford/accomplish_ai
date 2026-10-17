from .emulator import Client

OK, DENIED = 200, 403


def test_pilot_requests_are_server_only():
    assert Client("owner").set("pilotRequests/r1", {"name": "Pat", "email": "pat@example.com"}) == OK
    for uid in ("leader", "parent", "stranger", None):
        client = Client(uid)
        assert client.get("pilotRequests/r1") == DENIED
        assert client.set("pilotRequests/r2", {"name": "Spam"}) == DENIED
        assert client.set("pilotRequests/r1", {"name": "Changed"}) == DENIED


def test_pilot_usage_counters_are_server_only():
    assert Client("owner").set("pilotUsage/pilot_2026-10-16", {"count": 1}) == OK
    for uid in ("leader", "stranger", None):
        assert Client(uid).get("pilotUsage/pilot_2026-10-16") == DENIED
        assert Client(uid).set("pilotUsage/pilot_2026-10-16", {"count": 0}) == DENIED
