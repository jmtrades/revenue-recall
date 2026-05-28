-- Stripe webhook idempotency + atomic credit top-ups.
-- Stripe retries deliver the same event repeatedly, so we record processed
-- event ids and increment credits atomically (never read-modify-write).

create table if not exists stripe_events (
  id          text primary key,
  received_at timestamptz not null default now()
);

alter table stripe_events enable row level security;

create or replace function increment_ai_credits(p_org uuid, p_amount int)
returns void
language sql
as $$
  update orgs set ai_credits = ai_credits + p_amount where id = p_org;
$$;
