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
  accepted_at timestamptz,
  -- One row per (org, email): re-inviting upserts on this real constraint, which
  -- ON CONFLICT can infer (a partial/expression index cannot). Emails are always
  -- lowercased before insert, so this is effectively case-insensitive.
  unique (org_id, email)
);

-- Fast lookup at sign-in time ("is there a pending invite for this email?").
-- Stored emails are lowercased, matching the lowercased lookup query.
create index if not exists idx_invitations_email_pending
  on invitations(email) where status = 'pending';

alter table invitations enable row level security;
drop policy if exists org_rw_invitations on invitations;
create policy org_rw_invitations on invitations
  using (org_id = current_org_id()) with check (org_id = current_org_id());
