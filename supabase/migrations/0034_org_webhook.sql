-- Per-org outbound webhook endpoint. When set, the platform POSTs events (e.g.
-- lead.created) to this URL, signed with the per-org secret (HMAC-SHA256) so the
-- receiver can verify authenticity. One endpoint per workspace for v1.
alter table orgs add column if not exists webhook_url text;
alter table orgs add column if not exists webhook_secret text;
