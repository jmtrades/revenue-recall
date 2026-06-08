-- Recall snoozes: let a rep mute a deal in the recall queue until a chosen time
-- so it stops nagging, without losing it (it reappears automatically when the
-- snooze lapses, or on un-snooze). opportunity_id is text because it references
-- a provider-level id (may belong to a non-Supabase CRM), so no FK — same as
-- sequence_enrollments.

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
