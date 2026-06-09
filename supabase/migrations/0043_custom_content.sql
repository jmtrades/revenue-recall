-- Org-authored outreach content: custom message templates and custom
-- sequences, shown alongside (and above) the industry presets. Until now both
-- were hard-coded TypeScript arrays, so users couldn't change a word of their
-- own outreach. steps is JSONB matching the in-code SequenceStep shape
-- ({ day, channel, subject?, body }). Same org-scoped RLS pattern as the other
-- per-org operational tables; idempotent like every migration in this repo.

create table if not exists custom_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  channel     text not null check (channel in ('email','sms')),
  category    text not null default 'custom',
  subject     text,
  body        text not null,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_custom_templates_org on custom_templates(org_id, created_at desc);

alter table custom_templates enable row level security;
drop policy if exists org_rw_custom_templates on custom_templates;
create policy org_rw_custom_templates on custom_templates
  using (org_id = current_org_id()) with check (org_id = current_org_id());

create table if not exists custom_sequences (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  description text,
  steps       jsonb not null default '[]'::jsonb,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_custom_sequences_org on custom_sequences(org_id, created_at desc);

alter table custom_sequences enable row level security;
drop policy if exists org_rw_custom_sequences on custom_sequences;
create policy org_rw_custom_sequences on custom_sequences
  using (org_id = current_org_id()) with check (org_id = current_org_id());
