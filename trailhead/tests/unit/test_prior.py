from datetime import date

import pytest

from handlers.membership import InvalidInput
from handlers.prior import check_prior, completed_doc, keep_existing, partial_doc
from trailhead_core import load_catalog

TODAY = date(2026, 10, 14)
RECORD = {"birthYear": 2012, "birthMonth": 3}
CATALOG = load_catalog()


def check(**data):
    return check_prior(data, RECORD, CATALOG, TODAY)


def test_ranks_set_the_current_rank_to_the_highest_dated():
    plan = check(ranks={"tenderfoot": "2023-01-10", "second-class": "2023-06-01", "first-class": "2024-02-01"})
    assert plan.current_rank_id == "first-class"
    assert plan.rank_dates["tenderfoot"] == "2023-01-10"


def test_blank_rank_dates_are_ignored():
    assert check(ranks={"tenderfoot": "2023-01-10", "star": ""}).current_rank_id == "tenderfoot"


def test_rank_dates_must_follow_rank_order():
    with pytest.raises(InvalidInput, match="Second Class is dated before Tenderfoot"):
        check(ranks={"tenderfoot": "2024-01-10", "second-class": "2023-06-01"})


def test_dates_cannot_be_in_the_future_or_before_age_10():
    with pytest.raises(InvalidInput, match="future"):
        check(badges=[{"awardId": "chess", "date": "2027-01-01"}])
    with pytest.raises(InvalidInput, match="turned 10"):
        check(badges=[{"awardId": "chess", "date": "2021-01-01"}])
    with pytest.raises(InvalidInput, match="like 2025-06-14"):
        check(badges=[{"awardId": "chess", "date": "last summer"}])


def test_unknown_badges_are_refused():
    with pytest.raises(InvalidInput, match="Unknown merit badge"):
        check(badges=[{"awardId": "basket-weaving-101", "date": "2024-05-01"}])


def test_partials_need_real_requirement_numbers():
    plan = check(
        partials=[{"awardId": "camping", "date": "2025-07-01", "requirements": ["1", "2A", "4b", "9a(1)", "1"]}]
    )
    assert plan.partials["camping"] == ("2025-07-01", ["1", "2a", "4b", "9a(1)"])
    with pytest.raises(InvalidInput, match="doesn't look like a requirement"):
        check(partials=[{"awardId": "camping", "date": "2025-07-01", "requirements": ["swim test"]}])
    with pytest.raises(InvalidInput, match="List the requirements"):
        check(partials=[{"awardId": "camping", "date": "2025-07-01", "requirements": []}])


def test_a_badge_cannot_be_both_complete_and_partial():
    with pytest.raises(InvalidInput, match="both completed and partly done"):
        check(
            badges=[{"awardId": "chess", "date": "2024-05-01"}],
            partials=[{"awardId": "chess", "date": "2024-05-01", "requirements": ["1"]}],
        )


def test_documents_are_marked_as_earlier_work():
    done = completed_doc("s1", "chess", "v", "2024-05-01", "m1")
    assert done["status"] == "complete" and done["source"] == "prior"
    part = partial_doc("s1", "camping", "v", "2025-07-01", ["1", "2a"], "m1")
    assert part["requirements"]["2a"]["status"] == "signed"


def test_work_recorded_in_trailhead_is_never_overwritten():
    assert keep_existing({"status": "complete"})
    assert not keep_existing({"status": "complete", "source": "prior"})
    assert not keep_existing(None)
