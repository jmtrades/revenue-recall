-- Autopilot: user-defined AI agent tasks + an immutable run/outcome ledger.

create table if not exists agent_tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  goal        text not null,                                   -- natural-language instruction
  trigger     text not null default 'manual' check (trigger in ('manual','daily','on_new_lead','on_idle_deal')),
  scope       text not null default 'recall_queue',            -- recall_queue | all_open | stage:<id> | deal:<id>
  channel     text not null default 'email' check (channel in ('email','sms','call','none')),
  autonomy    text not null default 'review' check (autonomy in ('review','auto')),
  enabled     boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  last_run_at timestamptz
);

create table if not exists agent_runs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  task_id         uuid not null references agent_tasks(id) on delete cascade,
  status          text not null default 'completed' check (status in ('running','completed','failed')),
  summary         text,
  actions         jsonb not null default '[]'::jsonb,          -- ledger: [{type,dealId,title,detail,result,source,value}]
  items_processed int  not null default 0,
  recoverable     numeric not null default 0,
  ai              boolean not null default false,
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists idx_agent_tasks_org on agent_tasks(org_id);
create index if not exists idx_agent_runs_task on agent_runs(task_id);
create index if not exists idx_agent_runs_org on agent_runs(org_id);

alter table agent_tasks enable row level security;
alter table agent_runs  enable row level security;

drop policy if exists org_rw_agent_tasks on agent_tasks;
drop policy if exists org_rw_agent_runs on agent_runs;
create policy org_rw_agent_tasks on agent_tasks
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_agent_runs on agent_runs
  using (org_id = current_org_id()) with check (org_id = current_org_id());
