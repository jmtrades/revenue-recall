-- Audit log: an append-only trail of who did what (invites, billing, settings,
-- account deletion) for team accountability, dispute resolution, and compliance
-- evidence. Org-scoped; RLS on with no policies so only the service-role (the
-- app, which scopes every query by org_id) reads/writes it.
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  actor_id    text,
  actor_email text,
  action      text not null,
  target      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_log_org_created on audit_log (org_id, created_at desc);
alter table audit_log enable row level security;
