-- Per-org compliance identity (CAN-SPAM): the sender name and physical postal
-- address that appear in the outbound email footer. Each tenant sets their own,
-- so multi-tenant sending is lawful per org rather than one global value.

alter table orgs add column if not exists compliance jsonb not null default '{}'::jsonb;
