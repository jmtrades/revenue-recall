-- Recall attribution: a durable log of every recall outreach touch (a send from
-- a recall sequence, or a manual send from the recall queue). Lets us attribute
-- a later win to the recall effort that preceded it — hard attribution, rather
-- than inferring from enrollment timestamps. Deal/contact ids are provider-level
-- text ids (the CRM may not be Supabase), so no FK.

create table if not exists recall_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  deal_id     text,
  contact_id  text,
  channel     text not null check (channel in ('call','email','sms')),
  source      text not null default 'cadence' check (source in ('cadence','manual')),
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_recall_events_org on recall_events(org_id, occurred_at);
create index if not exists idx_recall_events_deal on recall_events(org_id, deal_id);

alter table recall_events enable row level security;
drop policy if exists org_rw_recall_events on recall_events;
create policy org_rw_recall_events on recall_events
  using (org_id = current_org_id()) with check (org_id = current_org_id());
