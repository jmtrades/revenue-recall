-- Cover two foreign keys that lacked an index (Supabase performance advisor
-- 0001_unindexed_foreign_keys). Without a covering index, FK lookups and cascade
-- deletes do sequential scans and the planner can't use the FK for joins:
--   bookings.meeting_type_id      → joins/cascades when a meeting type is changed/removed
--   custom_automation_runs.automation_id → the composite (org_id, automation_id)
--     index doesn't cover a lookup/cascade on automation_id alone.
-- Idempotent.
create index if not exists idx_bookings_meeting_type on public.bookings (meeting_type_id);
create index if not exists idx_custom_automation_runs_automation on public.custom_automation_runs (automation_id);
