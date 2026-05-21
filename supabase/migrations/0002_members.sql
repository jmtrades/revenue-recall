-- Team members (sales reps / owners). opportunities.owner_id and
-- activities.owner_id reference these. Kept separate from auth users so an org
-- can have members who haven't signed in yet (invited, imported, etc.).

create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  name        text not null,
  email       text,
  role        text not null default 'rep' check (role in ('owner','admin','manager','rep')),
  -- Links to a Supabase auth user once they sign in (nullable until then).
  auth_user_id uuid,
  created_at  timestamptz not null default now()
);

create index if not exists idx_members_org on members(org_id);
create index if not exists idx_members_auth on members(auth_user_id);

alter table members enable row level security;

create policy org_isolation_members on members
  using (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- Map an authenticated user to their org for the JWT org_id claim / app lookups.
create or replace function current_org_id() returns uuid
  language sql stable as $$
  select org_id from members where auth_user_id = auth.uid() limit 1;
$$;
