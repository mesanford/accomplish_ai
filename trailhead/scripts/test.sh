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
# Workers show the path the venv was created at (its scripts' #! line), which can differ from the real path when a
# parent folder is a symlink (~/Documents/Products -> ~/Products). Match the part that's the same either way.
workers=".deps.nosync/trailhead/functions-venv/bin/functions-framework"
# Wait for them to exit (up to 15 seconds, then force): a worker still shutting down holds its port, and the next
# batch's worker for that function then fails with "Address already in use", so every call to it gets an instant 400.
stop_workers() {
  pkill -f "$workers" || true
  for _ in {1..30}; do
    pgrep -f "$workers" >/dev/null || return 0
    sleep 0.5
  done
  pkill -9 -f "$workers" || true
}
stop_workers # leftovers from an earlier run that didn't finish
# Even per batch, stop the run if workers pile up or memory runs low (see scripts/memory_watchdog.sh).
WATCHDOG_WORKERS="$workers" scripts/memory_watchdog.sh "$$" &
watchdog=$!
trap 'stop_workers; kill "$watchdog" 2>/dev/null || true' EXIT
# The integration and browser tests run a few files at a time, each batch in its own emulator, so only the workers
# for one batch's functions are alive at once. One emulator for every file kept ~100 workers and used 10-20 GB.
batch_size=${TEST_BATCH_SIZE:-4}

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
# A real failure fails twice and still stops the run; a dropped emulator worker gets one more try.
integration=(tests/integration/test_*.py)
for ((i = 0; i < ${#integration[@]}; i += batch_size)); do
  batch="${integration[*]:i:batch_size}"
  echo "== Integration: $batch"
  RUN_FUNCTIONS_TESTS=1 firebase emulators:exec --only auth,firestore,functions,storage --project demo-trailhead \
    ".venv/bin/pytest -q $batch || { echo 'Retrying only the failed tests once (the local Functions emulator sometimes drops a worker mid-request)'; .venv/bin/pytest -q --lf $batch; }"
  stop_workers
done

npm --prefix app run typecheck
npm --prefix app test
npm --prefix app run build
e2e=(app/e2e/*.spec.ts)
e2e=("${e2e[@]#app/}") # Playwright runs from app/
for ((i = 0; i < ${#e2e[@]}; i += batch_size)); do
  batch="${e2e[*]:i:batch_size}"
  echo "== Browser: $batch"
  firebase emulators:exec --only auth,firestore,functions,storage --project demo-trailhead "npm --prefix app run e2e -- $batch"
  stop_workers
done
