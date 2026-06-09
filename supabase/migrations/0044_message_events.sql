-- Outbound-link click events: the engagement signal reports need to show
-- which outreach actually gets engaged with. contact_id/deal_id are soft text
-- refs (like recall_events) so history survives contact/deal deletion.
-- Open-pixel tracking is deliberately NOT implemented: outreach is plain-text
-- by design (human-indistinguishable emails), and pixels would undercut that.

create table if not exists message_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  kind        text not null default 'click' check (kind in ('click')),
  channel     text,
  contact_id  text,
  deal_id     text,
  url         text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_message_events_org on message_events(org_id, created_at desc);

alter table message_events enable row level security;
drop policy if exists org_isolation_message_events on message_events;
create policy org_isolation_message_events on message_events
  using (org_id = current_org_id()) with check (org_id = current_org_id());
