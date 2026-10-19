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

# Production gets only what's on GitHub: the deploy uses this folder as it is, so uncommitted edits, another branch or
# unpushed commits would otherwise go live with no record of what was deployed. Staging can deploy anything.
if [[ "$target" == "production" ]]; then
  git fetch --quiet origin main
  problem=""
  if [[ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]]; then
    problem="you're on $(git rev-parse --abbrev-ref HEAD), not main"
  elif [[ -n "$(git status --porcelain)" ]]; then
    problem="there are uncommitted changes (git status)"
  elif [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
    problem="main doesn't match origin/main (push or pull first)"
  fi
  if [[ -n "$problem" ]]; then
    echo "Not deploying to production: $problem." >&2
    exit 1
  fi
fi

echo "Checking everything before deploying to ${project}…"
scripts/test.sh

echo "Building the web app for ${target}…"
npm --prefix app run build -- --mode "$target"

echo "Loading badge and rank content…"
.venv/bin/python scripts/seed.py --project "$project"

echo "Deploying rules, indexes, functions and hosting…"
firebase deploy --project "$project" --only firestore,storage,functions,hosting

echo "Deploying the troop sites Hosting site (skipped unless TRAILHEAD_TROOPS_SITE is set)…"
scripts/deploy_troops_site.sh "$project"

# Tag what went live, so `git tag -l 'deploy/production-*'` shows every production deploy and the last one is live.
if [[ "$target" == "production" ]]; then
  tag="deploy/production-$(date -u +%Y-%m-%d-%H%M)"
  git tag -a "$tag" -m "Deployed to $project"
  git push --quiet origin "$tag" || echo "Deployed, but couldn't push the tag $tag; run: git push origin $tag" >&2
  echo "Tagged ${tag}."
fi
