-- Billing & AI-action metering. The metered quota is what guarantees gross
-- margin: a seat can never consume more inference than its plan includes
-- without buying credits (priced at ~90% margin), so cost can't outrun revenue.

alter table orgs add column if not exists plan                 text not null default 'starter';
alter table orgs add column if not exists plan_status          text not null default 'active';
alter table orgs add column if not exists seats                int  not null default 1;
alter table orgs add column if not exists ai_credits           int  not null default 0;
alter table orgs add column if not exists stripe_customer_id   text;
alter table orgs add column if not exists stripe_subscription_id text;
alter table orgs add column if not exists current_period_end   timestamptz;

-- Per-org, per-month AI action counter.
create table if not exists ai_usage (
  org_id       uuid not null references orgs(id) on delete cascade,
  period_start date not null,
  actions      int  not null default 0,
  primary key (org_id, period_start)
);

alter table ai_usage enable row level security;
-- Writes happen only via the service-role client (RPC below), which bypasses RLS.

-- Atomically consume one AI action. Returns 'included' | 'credit' | 'exhausted'.
create or replace function consume_ai_action(p_org uuid, p_included int)
returns text
language plpgsql
as $$
declare
  v_period date := date_trunc('month', now())::date;
  v_used   int;
begin
  insert into ai_usage(org_id, period_start, actions)
    values (p_org, v_period, 0)
    on conflict (org_id, period_start) do nothing;

  select actions into v_used from ai_usage
    where org_id = p_org and period_start = v_period
    for update;

  if v_used < p_included then
    update ai_usage set actions = actions + 1
      where org_id = p_org and period_start = v_period;
    return 'included';
  end if;

  update orgs set ai_credits = ai_credits - 1
    where id = p_org and ai_credits > 0;
  if found then
    return 'credit';
  end if;

  return 'exhausted';
end
$$;
