-- Public marketing capture (exit-intent waitlist / early-access). Not org-scoped.
-- Writes happen only through the service-role client in /api/waitlist, which
-- bypasses RLS — so RLS stays on with no public policies (deny by default).

create table if not exists waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  source     text,
  created_at timestamptz not null default now()
);

create unique index if not exists waitlist_email_key on waitlist (lower(email));

alter table waitlist enable row level security;
