#!/usr/bin/env bash
# Run every Trailhead check: lint, unit tests, security rules and end-to-end function tests.
# Needs the Firebase CLI (npm i -g firebase-tools) and Java 11+ for the emulators.
set -euo pipefail
cd "$(dirname "$0")/.."

.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/pytest -q tests/unit
firebase emulators:exec --only firestore --project demo-trailhead ".venv/bin/pytest -q tests/rules"
RUN_FUNCTIONS_TESTS=1 firebase emulators:exec --only auth,firestore,functions --project demo-trailhead \
  ".venv/bin/pytest -q tests/integration"
