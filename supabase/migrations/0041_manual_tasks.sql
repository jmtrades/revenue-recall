-- Manual tasks: a rep's own to-dos / reminders, shown alongside the
-- auto-generated next-actions on the Tasks page. Org-scoped; created_by is the
-- auth user id (text) for attribution. Same RLS pattern as the other per-org
-- operational tables.

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
