from trailhead_core.catalog import load_catalog
from trailhead_core.eagle import eagle_slots_filled, missing_eagle_required


def test_catalog_has_all_current_badges():
    catalog = load_catalog()
    assert len(catalog.badges) == 143
    # Discontinued in 2026 but kept for Scouts finishing it; it no longer fills an Eagle-required slot.
    society = catalog.badges["citizenship-in-society"]
    assert society.finish_by is not None and not society.counts_toward_eagle
    assert "american-indian-culture" in catalog.badges


def test_eagle_slots_add_up_to_thirteen():
    catalog = load_catalog()
    fixed = [b for b in catalog.badges.values() if b.eagle_required]
    assert len(fixed) + len(catalog.eagle_groups) == catalog.eagle_required_slots == 13
    assert catalog.eagle_groups["emergency"] == ("emergency-preparedness", "lifesaving")


def test_a_group_fills_one_slot_however_many_members():
    catalog = load_catalog()
    assert eagle_slots_filled(["swimming", "hiking", "cycling"], catalog) == 1
    assert eagle_slots_filled(["camping", "swimming", "archery"], catalog) == 2


def test_missing_lists_groups_as_choices():
    catalog = load_catalog()
    all_fixed = [b.id for b in catalog.badges.values() if b.eagle_required]
    missing = missing_eagle_required([*all_fixed, "lifesaving", "sustainability"], catalog)
    assert missing == ["Cycling or Hiking or Swimming"]
