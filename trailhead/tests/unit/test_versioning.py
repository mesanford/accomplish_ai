from trailhead_core.versioning import Requirement, migrate

OLD = [
    Requirement("o1", "1", "Discuss safety."),
    Requirement("o2", "2", "Do a home energy audit."),
    Requirement("o3", "3", "Use a videotape camera."),
]
NEW = [
    Requirement("n1", "1", "Discuss  safety"),  # same wording, different spacing and punctuation
    Requirement("n2", "2", "Do a home energy audit and share it with your family."),
    Requirement("n4", "4", "Explore a career."),
]


def test_unchanged_wording_carries_over():
    m = migrate({"o1": "signed", "o2": "signed", "o3": "in_progress"}, OLD, NEW)
    assert m.carried == {"n1": "signed"}


def test_changed_wording_needs_review():
    m = migrate({"o1": "signed", "o2": "signed"}, OLD, NEW)
    assert m.needs_review == ["n2"]


def test_removed_requirement_is_reported():
    m = migrate({"o3": "in_progress"}, OLD, NEW)
    assert m.dropped == ["o3"]
