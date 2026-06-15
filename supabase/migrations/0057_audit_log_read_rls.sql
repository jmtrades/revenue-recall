-- Make RLS an ACTIVE enforcer on the first user-facing read surface.
--
-- Background: every org-scoped table already has RLS enabled with membership-
-- based policies (current_org_id(), migration 0003), but the application has
-- always connected with the SERVICE-ROLE key, which bypasses RLS — so tenant
-- isolation has rested entirely on hand-written .eq("org_id", …) filters, with
-- Postgres doing nothing. We're now routing user-facing READS through the
-- session (anon-key) client so RLS is the thing enforcing isolation; a forgotten
-- filter becomes an empty result, not a cross-tenant leak.
--
-- audit_log was created (0032) with RLS ON and NO policy — i.e. service-role
-- only. That kept writes append-only and trustworthy, but it also means the
-- session client can read nothing. Add a SELECT-only, membership-scoped read
-- policy so the in-app Audit Log viewer can be served under RLS, while
-- deliberately granting NO insert/update/delete policy: writes stay
-- service-role-only (via recordAudit), preserving the append-only guarantee at
-- both the policy and privilege level.

drop policy if exists org_read_audit_log on audit_log;
create policy org_read_audit_log on audit_log
  for select using (org_id = current_org_id());

-- Table-level privilege for the session role. RLS still constrains rows; this
-- only ensures `authenticated` is permitted to SELECT at all (no write grant —
-- append-only is enforced here too). Idempotent.
grant select on audit_log to authenticated;
