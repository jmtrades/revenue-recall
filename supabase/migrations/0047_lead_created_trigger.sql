-- Custom automations: allow the lead_created trigger (fired from the shared
-- lead-capture choke point — API, hosted form, booking page). Re-creates the
-- trigger_kind check constraint with the new value; idempotent.
alter table custom_automations drop constraint if exists custom_automations_trigger_kind_check;
alter table custom_automations add constraint custom_automations_trigger_kind_check
  check (trigger_kind in ('stage_changed','deal_won','deal_lost','lead_created'));
