-- Revenue Recall — full schema (run once on a fresh Supabase database).
-- Generated from supabase/migrations/*.sql. Or: npm run db:migrate

-- ===== supabase/migrations/0001_init.sql =====
-- Revenue Recall — core schema.
-- Backs the built-in CRM for orgs that have no external CRM. External-CRM orgs
-- only use the `orgs` row for configuration. RLS is enabled and scoped per org.

create extension if not exists "pgcrypto";

create table if not exists orgs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  industry_id  text not null default 'generic',
  provider_id  text not null default 'builtin',
  currency     text not null default 'USD',
  created_at   timestamptz not null default now()
);

create table if not exists pipelines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  label       text not null,
  position    int  not null default 0
);

create table if not exists stages (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  label       text not null,
  probability numeric(4,3) not null default 0.2 check (probability between 0 and 1),
  type        text not null default 'open' check (type in ('open','won','lost')),
  position    int  not null default 0
);

create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  company     text,
  title       text,
  points      jsonb not null default '[]'::jsonb,
  attributes  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists opportunities (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  pipeline_id      uuid not null references pipelines(id) on delete cascade,
  stage_id         uuid not null references stages(id),
  contact_id       uuid references contacts(id) on delete set null,
  title            text not null,
  value            numeric(14,2) not null default 0,
  currency         text not null default 'USD',
  owner_id         uuid,
  source           text,
  tags             text[] not null default '{}',
  expected_close_at timestamptz,
  last_activity_at timestamptz,
  closed_at        timestamptz,
  loss_reason      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists activities (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  opportunity_id  uuid references opportunities(id) on delete cascade,
  contact_id      uuid references contacts(id) on delete cascade,
  kind            text not null check (kind in ('call','email','sms','meeting','note','task','stage_change')),
  summary         text not null,
  direction       text check (direction in ('inbound','outbound')),
  owner_id        uuid,
  occurred_at     timestamptz not null default now()
);

create index if not exists idx_opp_org on opportunities(org_id);
create index if not exists idx_opp_stage on opportunities(stage_id);
create index if not exists idx_opp_last_activity on opportunities(last_activity_at);
create index if not exists idx_act_opp on activities(opportunity_id);
create index if not exists idx_contact_org on contacts(org_id);

-- Row Level Security: every table is org-scoped via a JWT `org_id` claim.
alter table orgs           enable row level security;
alter table pipelines      enable row level security;
alter table stages         enable row level security;
alter table contacts       enable row level security;
alter table opportunities  enable row level security;
alter table activities     enable row level security;

create policy org_isolation_orgs on orgs
  using (id = (auth.jwt() ->> 'org_id')::uuid);
create policy org_isolation_pipelines on pipelines
  using (org_id = (auth.jwt() ->> 'org_id')::uuid);
create policy org_isolation_contacts on contacts
  using (org_id = (auth.jwt() ->> 'org_id')::uuid);
create policy org_isolation_opps on opportunities
  using (org_id = (auth.jwt() ->> 'org_id')::uuid);
create policy org_isolation_activities on activities
  using (org_id = (auth.jwt() ->> 'org_id')::uuid);
create policy org_isolation_stages on stages
  using (pipeline_id in (select id from pipelines where org_id = (auth.jwt() ->> 'org_id')::uuid));

-- ===== supabase/migrations/0002_members.sql =====
-- Team members (sales reps / owners). opportunities.owner_id and
-- activities.owner_id reference these. Kept separate from auth users so an org
-- can have members who haven't signed in yet (invited, imported, etc.).

create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  email       text,
  role        text not null default 'rep' check (role in ('owner','admin','manager','rep')),
  -- Links to a Supabase auth user once they sign in (nullable until then).
  auth_user_id uuid,
  created_at  timestamptz not null default now()
);

create index if not exists idx_members_org on members(org_id);
create index if not exists idx_members_auth on members(auth_user_id);

alter table members enable row level security;

create policy org_isolation_members on members
  using (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- Map an authenticated user to their org for the JWT org_id claim / app lookups.
create or replace function current_org_id() returns uuid
  language sql stable as $$
  select org_id from members where auth_user_id = auth.uid() limit 1;
$$;

-- ===== supabase/migrations/0003_org_settings_and_rls.sql =====
-- Editable org settings + membership-based RLS.

-- 1) Per-org monthly revenue goal (was env-only).
alter table orgs add column if not exists monthly_quota numeric not null default 250000;

-- 2) current_org_id() must be SECURITY DEFINER, or the members policy below
--    recurses (policy -> current_org_id() -> select members -> policy -> ...).
create or replace function current_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select org_id from members where auth_user_id = auth.uid() limit 1;
$$;

-- 3) Replace the JWT-claim policies with membership-based scoping so the anon
--    key + a signed-in user session can read/write only their org. The
--    service-role key still bypasses RLS for trusted server operations.
drop policy if exists org_isolation_orgs on orgs;
drop policy if exists org_isolation_pipelines on pipelines;
drop policy if exists org_isolation_contacts on contacts;
drop policy if exists org_isolation_opps on opportunities;
drop policy if exists org_isolation_activities on activities;
drop policy if exists org_isolation_stages on stages;
drop policy if exists org_isolation_members on members;

create policy org_rw_orgs on orgs
  using (id = current_org_id()) with check (id = current_org_id());
create policy org_rw_pipelines on pipelines
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_contacts on contacts
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_opps on opportunities
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_activities on activities
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_members on members
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_stages on stages
  using (pipeline_id in (select id from pipelines where org_id = current_org_id()))
  with check (pipeline_id in (select id from pipelines where org_id = current_org_id()));

-- ===== supabase/migrations/0004_agents.sql =====
-- Autopilot: user-defined AI agent tasks + an immutable run/outcome ledger.

create table if not exists agent_tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  goal        text not null,                                   -- natural-language instruction
  trigger     text not null default 'manual' check (trigger in ('manual','daily','on_new_lead','on_idle_deal')),
  scope       text not null default 'recall_queue',            -- recall_queue | all_open | stage:<id> | deal:<id>
  channel     text not null default 'email' check (channel in ('email','sms','call','none')),
  autonomy    text not null default 'review' check (autonomy in ('review','auto')),
  enabled     boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  last_run_at timestamptz
);

create table if not exists agent_runs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  task_id         uuid not null references agent_tasks(id) on delete cascade,
  status          text not null default 'completed' check (status in ('running','completed','failed')),
  summary         text,
  actions         jsonb not null default '[]'::jsonb,          -- ledger: [{type,dealId,title,detail,result,source,value}]
  items_processed int  not null default 0,
  recoverable     numeric not null default 0,
  ai              boolean not null default false,
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists idx_agent_tasks_org on agent_tasks(org_id);
create index if not exists idx_agent_runs_task on agent_runs(task_id);
create index if not exists idx_agent_runs_org on agent_runs(org_id);

alter table agent_tasks enable row level security;
alter table agent_runs  enable row level security;

drop policy if exists org_rw_agent_tasks on agent_tasks;
drop policy if exists org_rw_agent_runs on agent_runs;
create policy org_rw_agent_tasks on agent_tasks
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_agent_runs on agent_runs
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ===== supabase/migrations/0005_agent_outbox.sql =====
-- Approval inbox: AI-drafted messages awaiting a human's one-click send
-- (review-mode autopilot). Autonomous mode bypasses this and sends directly.

create table if not exists agent_outbox (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  run_id      uuid references agent_runs(id) on delete set null,
  task_id     uuid references agent_tasks(id) on delete set null,
  deal_id     uuid references opportunities(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  channel     text not null check (channel in ('email','sms')),
  subject     text,
  body        text not null,
  status      text not null default 'pending' check (status in ('pending','sent','dismissed')),
  source      text not null default 'ai' check (source in ('ai','template')),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index if not exists idx_outbox_org_status on agent_outbox(org_id, status);
create index if not exists idx_outbox_run on agent_outbox(run_id);

alter table agent_outbox enable row level security;
drop policy if exists org_rw_agent_outbox on agent_outbox;
create policy org_rw_agent_outbox on agent_outbox
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ===== supabase/migrations/0006_voice.sql =====
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


-- ===== supabase/migrations/0007_notification_prefs.sql =====
-- Per-org notification preferences (was a static, non-functional UI).
-- A JSON map of { settingKey: boolean }; unknown keys are ignored on read and
-- missing keys fall back to their defaults in the app layer (lib/org.ts).

alter table orgs add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
