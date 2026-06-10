-- Custom automations: the deal_idle trigger (a scan-based rule fired from the
-- cron when an open deal has had no activity for N days). Adds the trigger value
-- + a per-rule idle_days threshold, and a dedup table so a scan-based rule fires
-- at most once per deal. Idempotent.
alter table custom_automations drop constraint if exists custom_automations_trigger_kind_check;
alter table custom_automations add constraint custom_automations_trigger_kind_check
  check (trigger_kind in ('stage_changed','deal_won','deal_lost','lead_created','deal_idle'));

alter table custom_automations add column if not exists idle_days integer;

-- One row per (rule, entity) that a scan-based rule has already acted on, so the
-- recurring cron scan never re-fires the same rule for the same deal.
create table if not exists custom_automation_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  automation_id uuid not null references custom_automations(id) on delete cascade,
  entity_id     text not null,
  fired_at      timestamptz not null default now(),
  unique (org_id, automation_id, entity_id)
);

create index if not exists idx_custom_automation_runs_org on custom_automation_runs(org_id, automation_id);

alter table custom_automation_runs enable row level security;
drop policy if exists org_rw_custom_automation_runs on custom_automation_runs;
create policy org_rw_custom_automation_runs on custom_automation_runs
  using (org_id = current_org_id()) with check (org_id = current_org_id());
