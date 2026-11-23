-- Webinar registration, attendance, and recovery. Provider ids are text
-- (Zoom/Demio/GoTo are not our users). The registrant document lives in jsonb
-- so the lifecycle can grow without a migration per field; columns exist for
-- the lookups the hot path actually filters on. RLS is org-scoped. The service
-- role (webhooks, cron) bypasses RLS and always passes org_id explicitly.

create table if not exists webinar_sessions (
  org_id      uuid not null references orgs(id) on delete cascade,
  id          text not null,
  provider    text not null,
  title       text not null default 'Webinar',
  phase       text not null default 'scheduled',
  timezone    text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  offer_at    timestamptz,
  rejoin_url  text,
  replay_url  text,
  updated_at  timestamptz not null default now(),
  primary key (org_id, id)
);

create table if not exists webinar_registrants (
  org_id       uuid not null references orgs(id) on delete cascade,
  id           text not null,
  session_id   text not null,
  email        text,
  phone        text,
  state        text not null,
  next_due_at  timestamptz,
  version      integer not null default 0,
  data         jsonb not null,
  updated_at   timestamptz not null default now(),
  primary key (org_id, id)
);

create index if not exists idx_webinar_registrants_due
  on webinar_registrants (org_id, next_due_at)
  where next_due_at is not null;

create index if not exists idx_webinar_registrants_session
  on webinar_registrants (org_id, session_id);

create index if not exists idx_webinar_registrants_email
  on webinar_registrants (org_id, email);

create table if not exists webinar_events (
  org_id      uuid not null references orgs(id) on delete cascade,
  dedupe_key  text not null,
  created_at  timestamptz not null default now(),
  primary key (org_id, dedupe_key)
);

alter table webinar_sessions enable row level security;
alter table webinar_registrants enable row level security;
alter table webinar_events enable row level security;

drop policy if exists org_isolation_webinar_sessions on webinar_sessions;
create policy org_isolation_webinar_sessions on webinar_sessions
  using (org_id = current_org_id()) with check (org_id = current_org_id());

drop policy if exists org_isolation_webinar_registrants on webinar_registrants;
create policy org_isolation_webinar_registrants on webinar_registrants
  using (org_id = current_org_id()) with check (org_id = current_org_id());

drop policy if exists org_isolation_webinar_events on webinar_events;
create policy org_isolation_webinar_events on webinar_events
  using (org_id = current_org_id()) with check (org_id = current_org_id());
