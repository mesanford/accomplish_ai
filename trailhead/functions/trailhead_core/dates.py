"""Calendar helpers. Advancement rules count whole calendar months."""

from __future__ import annotations

import calendar
from datetime import date


def add_months(d: date, months: int) -> date:
    """Same day `months` later, clamped to the end of a shorter month."""
    total = d.month - 1 + months
    year, month = d.year + total // 12, total % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def end_of_month(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def age_deadline(birth_year: int, birth_month: int, age: int) -> tuple[date, date]:
    """Earliest and latest possible date of a birthday when only month and year are known."""
    return date(birth_year + age, birth_month, 1), end_of_month(birth_year + age, birth_month)
