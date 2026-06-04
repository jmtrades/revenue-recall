-- Per-org public API key for the Lead Capture API (POST /api/v1/leads). Only the
-- SHA-256 hash is stored (never the plaintext), so a database dump can't be used
-- to call the API. The prefix is a non-secret display hint (e.g. "rr_live_a1b2")
-- so the user can recognize which key is active. Index the hash for O(1) auth
-- lookups on the public endpoint.
alter table orgs add column if not exists api_key_hash text;
alter table orgs add column if not exists api_key_prefix text;
create index if not exists orgs_api_key_hash_idx on orgs (api_key_hash);
