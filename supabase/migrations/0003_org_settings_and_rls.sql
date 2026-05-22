-- Editable org settings + membership-based RLS.

-- 1) Per-org monthly revenue goal (was env-only).
alter table orgs add column if not exists monthly_quota numeric not null default 250000;

-- 2) current_org_id() must be SECURITY DEFINER, or the members policy below
--    recurses (policy -> current_org_id() -> select members -> policy -> ...).
create or replace function current_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select org_id from members where auth_user_id = auth.uid() limit 1;
$$;

-- 3) Replace the JWT-claim policies with membership-based scoping so the anon
--    key + a signed-in user session can read/write only their org. The
--    service-role key still bypasses RLS for trusted server operations.
drop policy if exists org_isolation_orgs on orgs;
drop policy if exists org_isolation_pipelines on pipelines;
drop policy if exists org_isolation_contacts on contacts;
drop policy if exists org_isolation_opps on opportunities;
drop policy if exists org_isolation_activities on activities;
drop policy if exists org_isolation_stages on stages;
drop policy if exists org_isolation_members on members;

create policy org_rw_orgs on orgs
  using (id = current_org_id()) with check (id = current_org_id());
create policy org_rw_pipelines on pipelines
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_contacts on contacts
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_opps on opportunities
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_activities on activities
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_members on members
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create policy org_rw_stages on stages
  using (pipeline_id in (select id from pipelines where org_id = current_org_id()))
  with check (pipeline_id in (select id from pipelines where org_id = current_org_id()));
