-- Custom automation rules: org-authored "when a deal hits this transition (with
-- these conditions), do these actions". Extends the preset automation library
-- (lib/automations.ts) with rules the org defines themselves. Executed on the
-- SAME safe, synchronous deal-stage fire point as the presets — actions are
-- internal (create a task / enroll a sequence / notify the owner), never an
-- autonomous customer-facing send.
--
-- trigger_kind ∈ stage_changed | deal_won | deal_lost (the executable subset for
-- now). stage_id optionally narrows stage_changed to one stage. conditions and
-- actions are validated JSONB (shape enforced by the API + evaluator).
create table if not exists custom_automations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  name          text not null,
  trigger_kind  text not null check (trigger_kind in ('stage_changed','deal_won','deal_lost')),
  stage_id      text,
  conditions    jsonb not null default '[]'::jsonb,
  actions       jsonb not null default '[]'::jsonb,
  enabled       boolean not null default true,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_custom_automations_org on custom_automations(org_id, enabled, trigger_kind);

alter table custom_automations enable row level security;
drop policy if exists org_rw_custom_automations on custom_automations;
create policy org_rw_custom_automations on custom_automations
  using (org_id = current_org_id()) with check (org_id = current_org_id());
