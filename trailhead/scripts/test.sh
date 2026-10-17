#!/usr/bin/env bash
# Run every Trailhead check: backend lint and tests, security rules, end-to-end function tests,
# then the web app's typecheck, unit tests, build and browser tests.
# Needs the Firebase CLI (npm i -g firebase-tools) and Java 11+ for the emulators.
set -euo pipefail
# On macOS, a forked Functions emulator worker crashes (SIGSEGV) when an HTTP call makes Python ask the system for its
# proxy settings, as deleting an Auth user does. Telling it to use no proxy skips that lookup. Linux is unaffected.
export NO_PROXY='*' no_proxy='*'
# macOS also kills a forked worker when the Objective-C runtime's fork-safety check trips during a network call
# (seen as "Request to function failed: Error: read ECONNRESET" and a trigger that never finishes). Linux is unaffected.
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
cd "$(dirname "$0")/.."
# Compiled Python goes outside the checkout, next to the dependencies, so iCloud doesn't sync it. This also reaches
# the Functions emulator's workers, which inherit the environment.
export PYTHONPYCACHEPREFIX="$(cd ../.. && pwd)/.deps.nosync/trailhead/pycache"

# The Functions emulator leaves its Python workers running after it exits, and they pile up over many runs.
# Stop this checkout's workers after each emulator run and whenever the script ends.
workers="$(cd functions/venv && pwd -P)/bin/functions-framework" # the real path, which is what the workers show
stop_workers() { pkill -f "$workers" || true; }
trap stop_workers EXIT

# The plan assistant declares the ANTHROPIC_API_KEY secret and the email senders declare RESEND_API_KEY. The emulator
# never calls either service (the emulator always logs email instead of sending), so stand-ins will do.
[[ -f functions/.secret.local ]] || echo "ANTHROPIC_API_KEY=emulator-never-calls-anthropic" > functions/.secret.local
grep -q '^RESEND_API_KEY=' functions/.secret.local || echo "RESEND_API_KEY=emulator-never-calls-resend" >> functions/.secret.local
# Card payments: the emulator only ever talks to the fake Stripe server the tests start (see tests/integration/fake_stripe.py).
# The webhook secret stand-in is the one tests sign fake deliveries with.
grep -q '^STRIPE_SECRET_KEY=' functions/.secret.local || echo "STRIPE_SECRET_KEY=sk_test_emulator-never-calls-stripe" >> functions/.secret.local
grep -q '^STRIPE_WEBHOOK_SECRET=' functions/.secret.local || echo "STRIPE_WEBHOOK_SECRET=whsec_emulator_stand_in" >> functions/.secret.local

.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/pytest -q tests/unit
firebase emulators:exec --only firestore,storage --project demo-trailhead ".venv/bin/pytest -q tests/rules"
RUN_FUNCTIONS_TESTS=1 firebase emulators:exec --only auth,firestore,functions,storage --project demo-trailhead \
  ".venv/bin/pytest -q tests/integration"
stop_workers

npm --prefix app run typecheck
npm --prefix app test
npm --prefix app run build
firebase emulators:exec --only auth,firestore,functions,storage --project demo-trailhead "npm --prefix app run e2e"
