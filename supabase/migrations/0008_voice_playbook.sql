-- Per-workspace playbook tuning, stored alongside the org's voice persona.
-- Newline-separated lists the rep can edit in Settings → Voice; when set, they
-- override the industry defaults in drafts/replies. Empty = use industry playbook.

alter table personas add column if not exists custom_next_steps text;
alter table personas add column if not exists custom_reengage  text;
