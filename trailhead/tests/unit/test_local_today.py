"""Server code decides "today" in US Central time (`handlers.retention.today_local` / `local_date`), not UTC.

Cloud Functions run in UTC, which is already tomorrow during US evenings: a check like "no future dates" then let a
leader enter tomorrow's date. This test stops `date.today()` or the UTC date from coming back.
"""

import re
from pathlib import Path

FUNCTIONS = Path(__file__).resolve().parents[2] / "functions"
UTC_TODAY = re.compile(r"date\.today\(\)|datetime\.now\(UTC\)\.date\(\)")
# Daily usage counters may use the UTC day: they only need a bucket per day, not the troop's calendar.
ALLOWED = {"endpoints/site_about.py"}


def test_server_code_uses_the_local_date_not_utc():
    found = []
    for path in sorted([*FUNCTIONS.glob("endpoints/*.py"), *FUNCTIONS.glob("handlers/*.py")]):
        rel = path.relative_to(FUNCTIONS).as_posix()
        if rel in ALLOWED:
            continue
        for number, line in enumerate(path.read_text().splitlines(), 1):
            if UTC_TODAY.search(line) and not line.lstrip().startswith("#"):
                found.append(f"{rel}:{number}: {line.strip()}")
    assert found == [], "Use today_local() or local_date(now) from handlers.retention:\n" + "\n".join(found)
