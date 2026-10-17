"""Scheduled functions (retention, reminders, domain sync) must accept Cloud Scheduler's timestamps, which sometimes
carry fractions of a second. firebase-functions 0.4.2 crashed on those before our code ran; 0.6.0 handles them."""

from firebase_functions import scheduler_fn
from flask import Flask, request


def test_schedule_times_with_and_without_fractions_of_a_second_are_accepted():
    seen = []

    @scheduler_fn.on_schedule(schedule="* * * * *")
    def job(event):
        seen.append(event.schedule_time.isoformat())

    app = Flask(__name__)
    for stamp in ("2026-10-17T01:30:01.608354-07:00", "2026-10-17T09:11:00-07:00"):
        with app.test_request_context("/", method="POST", headers={"X-CloudScheduler-ScheduleTime": stamp}):
            assert job(request).status_code == 200
    assert seen == ["2026-10-17T01:30:01.608354-07:00", "2026-10-17T09:11:00-07:00"]
