#!/usr/bin/env bash
# Initialize one org (pipeline, stages, member) in a freshly-migrated database
# by calling the running app's bootstrap endpoint. Starts CLEAN (no demo data) —
# real workspaces are live data only. Pass `true` only to seed a throwaway
# demo/preview org: ./scripts/db-bootstrap.sh true
# Prereqs: migrations applied, app running (npm run dev), ADMIN_TOKEN set.
# Usage: npm run db:bootstrap   (or  ./scripts/db-bootstrap.sh)
set -euo pipefail

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^(ADMIN_TOKEN|APP_URL)=' .env.local || true)
  set +a
fi

: "${ADMIN_TOKEN:?Set ADMIN_TOKEN in the environment or .env.local}"
APP_URL="${APP_URL:-http://localhost:3000}"
DEMO="${1:-false}"

echo "→ Bootstrapping org at $APP_URL (demo=$DEMO)"
curl -fsS -X POST "$APP_URL/api/admin/bootstrap" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"demo\": $DEMO}"
echo
echo "✓ Bootstrap complete."
