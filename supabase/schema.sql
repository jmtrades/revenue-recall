-- Revenue Recall — full schema (run once on a fresh Supabase database).
-- Generated from supabase/migrations/*.sql. Paste into the Supabase SQL editor,
-- or prefer: npm run db:migrate

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

