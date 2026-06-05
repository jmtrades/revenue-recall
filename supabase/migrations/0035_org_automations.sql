-- Per-org automation enable/disable preferences. The automations page ships a
-- starter library (lib/automations.ts) with default-on/off flags; this persists
-- an org's overrides as { automationId: boolean } so a toggle survives a refresh
-- (and acts as a master switch the engine respects — e.g. speed-to-lead). Mirrors
-- the other per-org jsonb settings columns (notification_prefs, theme, compliance).
alter table orgs add column if not exists automations jsonb not null default '{}'::jsonb;
