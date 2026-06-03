-- Idempotency for inbound webhooks (Twilio SMS / email providers deliver
-- at-least-once and retry on timeout). We record each provider event id once;
-- a retry then no-ops instead of logging the message twice and firing a second
-- auto-reply to the prospect. No tenant data here (just dedup keys), and RLS is
-- on with no policies so only the service-role (the webhooks) can touch it.
create table if not exists inbound_events (
  provider text not null,
  event_id text not null,
  created_at timestamptz not null default now(),
  primary key (provider, event_id)
);
alter table inbound_events enable row level security;
