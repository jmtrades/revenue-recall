-- RLS isolation verification — run this on STAGING before flipping
-- RLS_ENFORCE_READS=true in the app. It proves that, as a signed-in user, the
-- membership-based policies actually scope reads to that user's org (and deny
-- everyone else's). Run it in the Supabase SQL editor.
--
-- The SQL editor connects as a superuser, which BYPASSES RLS — so we first drop
-- to the `authenticated` role and impersonate a real user via the JWT `sub`
-- claim (which is what auth.uid() reads). Fill in the two placeholders.

begin;

-- 1) Become a signed-in user. <AUTH_USER_UID> = the user's Supabase auth id,
--    i.e. members.auth_user_id for the account you're testing.
set local role authenticated;
set local request.jwt.claims = '{"sub":"<AUTH_USER_UID>","role":"authenticated"}';

-- 2) Sanity: auth.uid() resolves and current_org_id() returns THIS user's org.
select auth.uid() as acting_uid, current_org_id() as resolved_org;

-- 3) Every org-scoped read must return ONLY this user's org. These counts
--    should match the org's real data (and never include other tenants).
select 'contacts'      as table, count(*) from contacts
union all select 'opportunities', count(*) from opportunities
union all select 'activities',    count(*) from activities
union all select 'audit_log',     count(*) from audit_log
union all select 'members',       count(*) from members;

-- 4) Cross-tenant probe — MUST return 0. Replace <OTHER_ORG_ID> with an org id
--    this user is NOT a member of: RLS must hide it even with an explicit filter.
-- select count(*) as must_be_zero from contacts where org_id = '<OTHER_ORG_ID>';

-- 5) Write-side check — inserting into another org MUST be rejected by WITH CHECK
--    (uncomment to confirm it errors, not silently succeeds):
-- insert into contacts (org_id, name) values ('<OTHER_ORG_ID>', 'rls probe');

rollback;  -- read-only verification; never commit
