-- Belt-and-suspenders: re-assert the recall-snooze + manual-tasks schema
-- idempotently, AND — by being a fresh migration file — guarantee the
-- GitHub→Supabase integration runs the pending migration set on the next push to
-- the production branch (it applies every not-yet-applied file in order, so this
-- forces 0040/0041 to deploy even if an earlier code-only push didn't trigger
-- the migration step). Everything here is CREATE IF NOT EXISTS / idempotent, so
-- it's a safe no-op when the tables already exist.

create table if not exists recall_snoozes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  opportunity_id text not null,
  until          timestamptz not null,
  created_at     timestamptz not null default now(),
  unique (org_id, opportunity_id)
);
create index if not exists idx_recall_snoozes_org_until on recall_snoozes(org_id, until);
alter table recall_snoozes enable row level security;
drop policy if exists org_rw_recall_snoozes on recall_snoozes;
create policy org_rw_recall_snoozes on recall_snoozes
  using (org_id = current_org_id()) with check (org_id = current_org_id());

create table if not exists manual_tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  title       text not null,
  due_at      timestamptz,
  done        boolean not null default false,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_manual_tasks_org on manual_tasks(org_id, done, created_at desc);
alter table manual_tasks enable row level security;
drop policy if exists org_rw_manual_tasks on manual_tasks;
create policy org_rw_manual_tasks on manual_tasks
  using (org_id = current_org_id()) with check (org_id = current_org_id());
