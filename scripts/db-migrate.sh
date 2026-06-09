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

# Ledger: record applied files so re-runs skip them and a future non-idempotent
# migration can't half-apply twice. Each file runs in a single transaction.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c "create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now());"

for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  applied=$(psql "$SUPABASE_DB_URL" -tAc "select 1 from schema_migrations where filename = '$name' limit 1")
  if [[ "$applied" == "1" ]]; then
    echo "↷ Skipping $name (already applied)"
    continue
  fi
  echo "→ Applying $name"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$f"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -c "insert into schema_migrations (filename) values ('$name') on conflict (filename) do nothing;"
done

echo "✓ Migrations applied."
