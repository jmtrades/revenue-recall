-- Per-org outbound CALL voice (the in-house Kokoro voice id the AI speaks in on
-- calls), or a "clone:<id>" signature voice. Null = the gateway default (Aria).
alter table orgs add column if not exists voice_id text;
