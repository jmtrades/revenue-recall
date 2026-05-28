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
