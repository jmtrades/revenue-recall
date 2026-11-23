-- Results ledger. One row per meaningful action (send, click, call, webinar
-- join/leave, booking, win, opt-out, AI action, cost). Provider-level ids are
-- text — the CRM may not be Supabase. dedupe_key makes webhook retries idempotent.
-- RLS is org-scoped, same contract as recall_events.

create table if not exists analytics_events (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  dedupe_key   text not null,
  name         text not null,
  occurred_at  timestamptz not null default now(),
  channel      text,
  contact_id   text,
  deal_id      text,
  lead_id      text,
  campaign_id  text,
  sequence_id  text,
  step_id      text,
  revenue      numeric,
  cost         numeric,
  actor        text,
  created_at   timestamptz not null default now(),
  unique (org_id, dedupe_key)
);

create index if not exists idx_analytics_events_org_time
  on analytics_events (org_id, occurred_at desc);

create index if not exists idx_analytics_events_lead
  on analytics_events (org_id, contact_id, deal_id);

alter table analytics_events enable row level security;
drop policy if exists org_isolation_analytics_events on analytics_events;
create policy org_isolation_analytics_events on analytics_events
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- Weekly results email uses a third digest kind. The original check only
-- allowed the daily digest and task reminders.
alter table digest_runs drop constraint if exists digest_runs_kind_check;
alter table digest_runs add constraint digest_runs_kind_check
  check (kind in ('daily_digest', 'task_reminders', 'weekly_results'));
