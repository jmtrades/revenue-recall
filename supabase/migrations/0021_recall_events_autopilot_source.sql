-- Allow 'autopilot' as a recall-touch source.
-- recordRecallTouch is now also called from the autonomous agent (engine.ts)
-- when it works an at-risk/recall deal, so won-back ROI captures autopilot
-- outreach too — not just manual sends and recall sequences. The original
-- CHECK only allowed ('cadence','manual'), which would reject the insert.
-- Idempotent: drop + re-add.

alter table recall_events drop constraint if exists recall_events_source_check;
alter table recall_events
  add constraint recall_events_source_check check (source in ('cadence','manual','autopilot'));
