-- Usage credits: extra AI actions a customer buys on top of their plan's monthly
-- allowance ("top-ups"). Credits apply to a billing month (period = YYYY-MM) and
-- stack. `ref` (the Stripe checkout session id) is unique so webhook retries
-- never double-credit.
create table if not exists usage_credits (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  period     text not null,            -- 'YYYY-MM' the credits apply to
  actions    int  not null default 0,  -- extra AI actions granted
  source     text,                     -- 'topup' | 'grant'
  ref        text,                     -- Stripe checkout session id (idempotency)
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_credits_org_period on usage_credits(org_id, period);
create unique index if not exists uq_usage_credits_ref on usage_credits(ref) where ref is not null;

alter table usage_credits enable row level security;
drop policy if exists org_rw_usage_credits on usage_credits;
create policy org_rw_usage_credits on usage_credits
  using (org_id = current_org_id()) with check (org_id = current_org_id());
