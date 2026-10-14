#!/usr/bin/env bash
# Run every Trailhead check: backend lint and tests, security rules, end-to-end function tests,
# then the web app's typecheck, unit tests, build and browser tests.
# Needs the Firebase CLI (npm i -g firebase-tools) and Java 11+ for the emulators.
set -euo pipefail
cd "$(dirname "$0")/.."

.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/pytest -q tests/unit
firebase emulators:exec --only firestore,storage --project demo-trailhead ".venv/bin/pytest -q tests/rules"
RUN_FUNCTIONS_TESTS=1 firebase emulators:exec --only auth,firestore,functions,storage --project demo-trailhead \
  ".venv/bin/pytest -q tests/integration"

npm --prefix app run typecheck
npm --prefix app test
npm --prefix app run build
firebase emulators:exec --only auth,firestore,functions,storage --project demo-trailhead "npm --prefix app run e2e"
