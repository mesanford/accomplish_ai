"""Paper blue cards in the Scoutbook report: counted by when they were recorded, shown by their real dates."""

from datetime import UTC, datetime

from handlers.scoutbook import row_keys

from .test_scoutbook import NOW, SINCE, report, signoff


def paper_signoff(req, signed, recorded, behalf="Jordan Smith"):
    return {**signoff(req=req, when=signed), "recordedAt": recorded, "onBehalfOf": behalf, "source": "paper"}


def test_paper_signoff_dated_before_the_last_report_but_recorded_after_it_appears_once():
    signed = datetime(2026, 8, 15, 12, tzinfo=UTC)  # before SINCE
    items = [paper_signoff("1", signed, datetime(2026, 9, 20, 8, tzinfo=UTC))]
    rows = report(items)
    assert [(r["requirement"], r["date"]) for r in rows] == [("1", "2026-08-15")]
    assert rows[0]["signedBy"] == "Pat Leader (for Jordan Smith, counselor)"
    # The next report starts when this one ended, so the same sign-off is not listed again.
    assert report(items, since=NOW) == []


def test_paper_signoff_recorded_before_the_last_report_is_not_new():
    signed = datetime(2026, 9, 10, 12, tzinfo=UTC)  # inside the window, but entered and reported earlier
    assert report([paper_signoff("1", signed, datetime(2026, 8, 20, tzinfo=UTC))]) == []


def test_signoffs_without_recorded_at_still_count_by_signed_date():
    assert len(report([signoff(when=datetime(2026, 9, 10, tzinfo=UTC))])) == 1
    assert report([signoff(when=datetime(2026, 8, 10, tzinfo=UTC))]) == []


def test_paper_completion_counts_by_when_it_was_recorded_and_shows_its_real_date():
    done = {
        "scoutId": "s1",
        "awardId": "camping",
        "status": "complete",
        "completedAt": "2026-07-04",
        "recordedAt": datetime(2026, 9, 20, 8, tzinfo=UTC),
        "source": "paper",
    }
    rows = report(progress=[done])
    assert [(r["kind"], r["date"]) for r in rows] == [("merit_badge", "2026-07-04")]
    assert report(progress=[done], already=row_keys(rows)) == []
    old = {**done, "recordedAt": datetime(2026, 8, 20, 8, tzinfo=UTC)}
    assert report(progress=[old]) == []


def test_earlier_advancement_stays_out_even_with_a_recorded_at():
    prior = {
        "scoutId": "s1",
        "awardId": "chess",
        "status": "complete",
        "completedAt": "2026-07-04",
        "recordedAt": datetime(2026, 9, 20, 8, tzinfo=UTC),
        "source": "prior",
    }
    assert report(progress=[prior]) == []
    assert SINCE < NOW
