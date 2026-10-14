#!/usr/bin/env bash
# Deploy Trailhead to a Firebase project alias: staging or production.
#   scripts/deploy.sh staging
# Needs: `firebase login`, the alias set in .firebaserc, and app/.env.<alias> with the web app config.
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-}"
if [[ "$target" != "staging" && "$target" != "production" ]]; then
  echo "Usage: scripts/deploy.sh staging|production" >&2
  exit 2
fi
project="$(node -e "const fs = require('fs'); console.log(JSON.parse(fs.readFileSync('.firebaserc', 'utf8')).projects[process.argv[1]] || '')" "$target")"
if [[ -z "$project" || "$project" == REPLACE* ]]; then
  echo "Set the '$target' project id in .firebaserc first (firebase use --add)." >&2
  exit 1
fi
if [[ ! -f "app/.env.$target" ]]; then
  echo "Create app/.env.$target from app/.env.example with the web app config for $project." >&2
  exit 1
fi

echo "Checking everything before deploying to ${project}…"
scripts/test.sh

echo "Building the web app for ${target}…"
npm --prefix app run build -- --mode "$target"

echo "Loading badge and rank content…"
.venv/bin/python scripts/seed.py --project "$project"

echo "Deploying rules, indexes, functions and hosting…"
firebase deploy --project "$project" --only firestore,storage,functions,hosting
