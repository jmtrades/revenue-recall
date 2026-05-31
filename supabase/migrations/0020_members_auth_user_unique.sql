-- One auth user maps to exactly one member row.
-- ensureOrgForUser() checks for an existing membership before creating a fresh
-- org, but a network error between the check and the insert (or two near-
-- simultaneous first requests) could create duplicate orgs for the same user.
-- A partial unique index makes the database the source of truth: a second
-- insert for the same auth_user_id fails instead of silently forking the
-- account. Partial (WHERE not null) so invited-but-not-yet-signed-in members,
-- whose auth_user_id is null, are unaffected.

create unique index if not exists uniq_members_auth_user
  on members(auth_user_id)
  where auth_user_id is not null;
