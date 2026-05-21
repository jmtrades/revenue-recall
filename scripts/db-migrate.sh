#!/usr/bin/env bash
# Apply all SQL migrations to a Supabase/Postgres database, in order.
# Usage:
#   SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres" ./scripts/db-migrate.sh
# Or set SUPABASE_DB_URL in .env.local and run: npm run db:migrate
set -euo pipefail

# Load .env.local if present (so SUPABASE_DB_URL can live there).
if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^SUPABASE_DB_URL=' .env.local || true)
  set +a
fi

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL (Postgres connection string) in the environment or .env.local}"

if [[ "$SUPABASE_DB_URL" == *"[YOUR-PASSWORD]"* ]]; then
  echo "✗ SUPABASE_DB_URL still contains the [YOUR-PASSWORD] placeholder. Put your real DB password in .env.local first." >&2
  exit 1
fi

for f in supabase/migrations/*.sql; do
  echo "→ Applying $f"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "✓ Migrations applied."
