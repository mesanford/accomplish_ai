#!/usr/bin/env bash
# Stops the test run before the machine runs out of memory. The Functions emulator keeps one Python worker per
# function alive until it exits, and workers an earlier run left behind add to them; together they once used all of
# a 16 GB Mac's memory. Every few seconds this checks the worker count and free memory; if either crosses its limit,
# it stops the workers, the emulators and the test script, so the run fails instead of the machine.
# Usage: WATCHDOG_WORKERS=<worker path> memory_watchdog.sh <test script pid>
# The worker path comes in the environment, not as an argument, so pgrep doesn't count (or pkill stop) this script.
set -uo pipefail
parent=$1
max_workers=${TEST_MAX_WORKERS:-150} # about one per function, per emulator run
min_free=${TEST_MIN_FREE_PERCENT:-20}

free_percent() {
  if command -v memory_pressure >/dev/null; then
    memory_pressure -Q | awk -F': ' '/free percentage/ {print $2 + 0}'
  elif [[ -r /proc/meminfo ]]; then
    awk '/^MemTotal/ {t = $2} /^MemAvailable/ {a = $2} END {print int(a * 100 / t)}' /proc/meminfo
  else
    echo 100
  fi
}

while kill -0 "$parent" 2>/dev/null; do
  count=$(pgrep -f "$WATCHDOG_WORKERS" | wc -l | tr -d ' ')
  free=$(free_percent)
  if ((count > max_workers || free < min_free)); then
    echo "memory_watchdog: stopping the tests: ${count} emulator workers, ${free}% memory free" \
      "(limits: ${max_workers} workers, ${min_free}% free; set TEST_MAX_WORKERS or TEST_MIN_FREE_PERCENT to change)" >&2
    pkill -f "$WATCHDOG_WORKERS"
    pkill -f "emulators:exec.*demo-trailhead"
    kill "$parent"
    exit 1
  fi
  sleep 3
done
