-- Voice / persona: how this org's outreach should sound. The AI writes in this
-- voice so messages read like a specific human, never like an AI or a template.

create table if not exists personas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade unique,
  sender_name text,
  role        text,
  signature   text,
  samples     text,   -- raw input the user provided (description + example messages)
  profile     text,   -- AI-distilled style guide used to steer drafts
  updated_at  timestamptz not null default now()
);

alter table personas enable row level security;
drop policy if exists org_rw_personas on personas;
create policy org_rw_personas on personas
  using (org_id = current_org_id()) with check (org_id = current_org_id());
