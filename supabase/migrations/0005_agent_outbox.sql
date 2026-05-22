-- Approval inbox: AI-drafted messages awaiting a human's one-click send
-- (review-mode autopilot). Autonomous mode bypasses this and sends directly.

create table if not exists agent_outbox (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  run_id      uuid references agent_runs(id) on delete set null,
  task_id     uuid references agent_tasks(id) on delete set null,
  deal_id     uuid references opportunities(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  channel     text not null check (channel in ('email','sms')),
  subject     text,
  body        text not null,
  status      text not null default 'pending' check (status in ('pending','sent','dismissed')),
  source      text not null default 'ai' check (source in ('ai','template')),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index if not exists idx_outbox_org_status on agent_outbox(org_id, status);
create index if not exists idx_outbox_run on agent_outbox(run_id);

alter table agent_outbox enable row level security;
drop policy if exists org_rw_agent_outbox on agent_outbox;
create policy org_rw_agent_outbox on agent_outbox
  using (org_id = current_org_id()) with check (org_id = current_org_id());
