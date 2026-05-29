-- Team invitations. A workspace owner/admin invites teammates by email; the
-- pending invite is matched on first sign-in (by email), which joins the
-- invitee to the inviting org as a member instead of provisioning a new org.
-- Kept separate from members so an invite can exist before the person signs up.

create table if not exists invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  email       text not null,
  role        text not null default 'rep' check (role in ('admin','manager','rep')),
  token       text not null unique,
  status      text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by  uuid,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

-- One live invite per email per org; lets re-inviting upsert cleanly.
create unique index if not exists idx_invitations_org_email_pending
  on invitations(org_id, lower(email)) where status = 'pending';
-- Fast lookup at sign-in time ("is there a pending invite for this email?").
create index if not exists idx_invitations_email_pending
  on invitations(lower(email)) where status = 'pending';

alter table invitations enable row level security;
drop policy if exists org_rw_invitations on invitations;
create policy org_rw_invitations on invitations
  using (org_id = current_org_id()) with check (org_id = current_org_id());
