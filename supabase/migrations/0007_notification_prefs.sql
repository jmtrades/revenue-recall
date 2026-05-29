-- Per-org notification preferences (was a static, non-functional UI).
-- A JSON map of { settingKey: boolean }; unknown keys are ignored on read and
-- missing keys fall back to their defaults in the app layer (lib/org.ts).

alter table orgs add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
