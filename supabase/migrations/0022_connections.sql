-- Per-org self-serve connections: the credentials an org enters to connect
-- their OWN social accounts (WhatsApp/Instagram/Messenger/Telegram/X/LinkedIn)
-- and their OWN data source (database / CRM), instead of one shared set of
-- global env vars for the whole app.
--
-- Secret values (tokens, connection strings) are stored ENCRYPTED at the
-- application layer (AES-256-GCM, see src/lib/crypto.ts) inside the `secrets`
-- jsonb — the DB never holds them in the clear. Non-secret config (labels,
-- which account id this maps to) lives in `config`.
--
-- `account_ref` is the platform-side account identifier an inbound webhook
-- carries (WhatsApp phone_number_id, Meta page id, Telegram bot id, X
-- for_user_id). It lets the multi-tenant webhook route an incoming message to
-- the org that owns that account WITHOUT a user session — so it's looked up by
-- the service-role client, bypassing RLS, scoped to (provider, account_ref).

create table if not exists connections (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  -- "social" | "database" | "crm"
  kind         text not null,
  -- platform/provider id: whatsapp|instagram|messenger|telegram|x|linkedin|database
  provider     text not null,
  -- platform account id for inbound webhook routing (nullable; social only)
  account_ref  text,
  -- encrypted secrets (token, app_secret, verify_token, url, …), app-encrypted
  secrets      jsonb not null default '{}'::jsonb,
  -- non-secret config (label, mapping, version, …)
  config       jsonb not null default '{}'::jsonb,
  connected    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, provider)
);

create index if not exists idx_connections_org on connections(org_id);
-- Webhook routing: find the owning org by platform + account, no session needed.
create index if not exists idx_connections_account on connections(provider, account_ref);

alter table connections enable row level security;
drop policy if exists org_rw_connections on connections;
create policy org_rw_connections on connections
  using (org_id = current_org_id()) with check (org_id = current_org_id());
