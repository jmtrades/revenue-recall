-- Per-org appearance. Stores the chosen accent (and room for future appearance
-- options) as a small JSON blob; the app reads it to theme the UI chrome.

alter table orgs add column if not exists theme jsonb not null default '{}'::jsonb;
