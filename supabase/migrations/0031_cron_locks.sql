-- Per-org advisory locks for scheduled work. Cadence sending must not run twice
-- concurrently for one org (a scheduled cron tick overlapping a manual run, or a
-- run that exceeds the interval) — that would send the same step to a prospect
-- twice. A short-TTL lock row serializes it; a crashed run's lock auto-expires.
-- No tenant data; RLS on with no policies → service-role (the cron) only.
create table if not exists cron_locks (
  key text primary key,
  expires_at timestamptz not null
);
alter table cron_locks enable row level security;
