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

-- ===== supabase/migrations/0008_voice_playbook.sql =====
-- Per-workspace playbook tuning, stored alongside the org's voice persona.
-- Newline-separated lists the rep can edit in Settings → Voice; when set, they
-- override the industry defaults in drafts/replies. Empty = use industry playbook.

alter table personas add column if not exists custom_next_steps text;
alter table personas add column if not exists custom_reengage  text;

-- ===== supabase/migrations/0009_sequence_enrollments.sql =====
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

-- ===== supabase/migrations/0010_digest_runs.sql =====
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

-- ===== supabase/migrations/0011_org_theme.sql =====
-- Per-org appearance. Stores the chosen accent (and room for future appearance
-- options) as a small JSON blob; the app reads it to theme the UI chrome.

alter table orgs add column if not exists theme jsonb not null default '{}'::jsonb;

-- ===== supabase/migrations/0012_subscriptions.sql =====
-- Billing subscriptions, one row per org. Populated by Stripe Checkout
-- completion and kept in sync by the Stripe webhook. Orgs with no row are
-- treated as the free plan. The Stripe ids let the webhook map events back to
-- the right org.

create table if not exists subscriptions (
  org_id                 uuid primary key references orgs(id) on delete cascade,
  plan                   text not null default 'free' check (plan in ('free','growth','scale')),
  status                 text not null default 'none' check (status in ('none','trialing','active','past_due','canceled')),
  seats                  int not null default 1,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

create index if not exists idx_subscriptions_customer on subscriptions(stripe_customer_id);

alter table subscriptions enable row level security;
drop policy if exists org_rw_subscriptions on subscriptions;
create policy org_rw_subscriptions on subscriptions
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ===== supabase/migrations/0013_ai_usage.sql =====
-- AI usage ledger. One row per live AI completion, so spend is visible per org
-- and the monthly budget cap can be enforced. Costs are recorded in USD at the
-- time of the call (prices can change), with token counts for auditing.

create table if not exists ai_usage (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd      numeric not null default 0,
  feature       text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_ai_usage_org_time on ai_usage(org_id, created_at);

alter table ai_usage enable row level security;
drop policy if exists org_rw_ai_usage on ai_usage;
create policy org_rw_ai_usage on ai_usage
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ===== supabase/migrations/0014_org_compliance.sql =====
-- Per-org compliance identity (CAN-SPAM): the sender name and physical postal
-- address that appear in the outbound email footer. Each tenant sets their own,
-- so multi-tenant sending is lawful per org rather than one global value.

alter table orgs add column if not exists compliance jsonb not null default '{}'::jsonb;
