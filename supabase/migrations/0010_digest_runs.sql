-- Scheduled-email de-duplication. The cron tick may fire many times a day, but
-- a daily digest / task-reminder email should go out at most once per calendar
-- day per org. This table records the last day each kind was sent so runDigests
-- stays idempotent.

create table if not exists digest_runs (
  org_id   uuid not null references orgs(id) on delete cascade,
  kind     text not null check (kind in ('daily_digest','task_reminders')),
  sent_on  date not null,
  primary key (org_id, kind)
);

alter table digest_runs enable row level security;
drop policy if exists org_rw_digest_runs on digest_runs;
create policy org_rw_digest_runs on digest_runs
  using (org_id = current_org_id()) with check (org_id = current_org_id());
