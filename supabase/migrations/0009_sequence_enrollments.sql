-- Cadence runtime: sequence enrollments. Sequences were static definitions;
-- this table makes them executable. A contact/deal is enrolled in a sequence
-- and the scheduler (the Autopilot cron) advances each enrollment through its
-- steps on schedule. Contact/deal ids are stored as text because they reference
-- provider-level ids (which may belong to a non-Supabase CRM), so no FK.

create table if not exists sequence_enrollments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  sequence_id   text not null,
  contact_id    text not null,
  deal_id       text,
  step_index    int not null default 0,
  status        text not null default 'active' check (status in ('active','completed','stopped')),
  enrolled_at   timestamptz not null default now(),
  next_due_at   timestamptz not null,
  last_step_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_enrollments_org_status on sequence_enrollments(org_id, status);
create index if not exists idx_enrollments_due on sequence_enrollments(org_id, status, next_due_at);

alter table sequence_enrollments enable row level security;
drop policy if exists org_rw_sequence_enrollments on sequence_enrollments;
create policy org_rw_sequence_enrollments on sequence_enrollments
  using (org_id = current_org_id()) with check (org_id = current_org_id());
