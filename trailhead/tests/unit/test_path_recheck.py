"""The path check trigger when the path is deleted while it's being checked (removing a Scout erases their paths)."""

from types import SimpleNamespace

import pytest
from google.api_core.exceptions import NotFound

from endpoints import advancement

PATH = {"scoutId": "s1", "goalAwardId": "first-class"}


class Reference:
    def __init__(self, error=None):
        self.error, self.updates = error, []

    def update(self, fields):
        if self.error:
            raise self.error
        self.updates.append(fields)


def written(reference):
    after = SimpleNamespace(exists=True, to_dict=lambda: dict(PATH), reference=reference)
    return SimpleNamespace(params={"troopId": "t1"}, data=SimpleNamespace(before=None, after=after))


@pytest.fixture(autouse=True)
def no_scout_record(monkeypatch):
    monkeypatch.setattr(advancement, "troop", lambda troop_id: None)
    monkeypatch.setattr(advancement, "_scout_record", lambda t, scout_id: None)


def test_new_path_gets_its_feasibility():
    ref = Reference()
    advancement.recheck_path(written(ref))
    assert ref.updates == [{"feasibility": advancement.NO_RECORD}]


def test_a_path_deleted_during_the_check_is_left_alone():
    advancement.recheck_path(written(Reference(NotFound("no entity to update"))))


def test_other_errors_still_fail_the_trigger():
    with pytest.raises(RuntimeError):
        advancement.recheck_path(written(Reference(RuntimeError("boom"))))
