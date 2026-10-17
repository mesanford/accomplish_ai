#!/usr/bin/env bash
# Deploy the dedicated "troop sites" Hosting site that serves troops' own domains (see DEPLOY.md, "Troop domains").
#   scripts/deploy_troops_site.sh <firebase-project-id>
# Run after `npm --prefix app run build`. Skips quietly when the project has no TRAILHEAD_TROOPS_SITE setting.
#
# The site holds the same built app as the main site, minus index.html. With no index.html, "/" matches no file, so
# every address on a troop's domain is rewritten to the site_shell function, which looks the host up and serves that
# troop's site. The app's scripts and styles (/assets/...) are served as ordinary files.
set -euo pipefail
cd "$(dirname "$0")/.."

project="${1:-}"
if [[ -z "$project" ]]; then
  echo "Usage: scripts/deploy_troops_site.sh <firebase-project-id>" >&2
  exit 2
fi
env_file="functions/.env.$project"
site="$(grep -E '^TRAILHEAD_TROOPS_SITE=' "$env_file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true)"
if [[ -z "$site" ]]; then
  echo "No TRAILHEAD_TROOPS_SITE in $env_file; skipping the troop sites Hosting site."
  exit 0
fi

rm -rf app/dist-troops
cp -R app/dist app/dist-troops
rm -f app/dist-troops/index.html

config=".firebase.troops.json"
cat >"$config" <<JSON
{
  "hosting": {
    "site": "$site",
    "public": "app/dist-troops",
    "ignore": ["firebase.json", "**/.*"],
    "rewrites": [
      { "source": "/cal/**", "function": { "functionId": "calendar_feed", "region": "us-central1" } },
      { "source": "**", "function": { "functionId": "site_shell", "region": "us-central1" } }
    ]
  }
}
JSON
trap 'rm -f "$config"' EXIT
firebase deploy --project "$project" --config "$config" --only hosting
