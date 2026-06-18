-- Flywheel attribution: capture WHICH messaging recovered a deal, not just that
-- a touch happened. Three nullable dimensions on each recall touch so a later win
-- can be sliced by vertical, by which cadence step worked, and which sequence —
-- the per-vertical / per-cadence recovery signal that compounds into a moat.
-- All nullable + backfill-free: existing rows and the no-DB demo are unaffected.

alter table recall_events add column if not exists industry    text;
alter table recall_events add column if not exists step_index  int;
alter table recall_events add column if not exists sequence_id text;
