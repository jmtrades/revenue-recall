-- Per-org IANA timezone (e.g. 'America/New_York'). Drives the daily digest's
-- local send time so a global customer base gets "Good morning" in the morning,
-- not at a fixed UTC hour. Null = fall back to the fixed-UTC digest hour.
alter table orgs add column if not exists timezone text;
