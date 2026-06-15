-- Make the "service-role only" tables explicit. These four have RLS enabled but
-- no policy, which already DENIES all client (anon/authenticated) access — the
-- service-role key bypasses RLS, so the cron/webhook/server code that uses them
-- is unaffected. This adds an explicit deny-all policy so the intent is obvious
-- in the dashboard and the Supabase advisor (rls_enabled_no_policy) is satisfied.
-- Idempotent.
do $$
declare t text;
begin
  foreach t in array array['audit_log','cron_locks','inbound_events','rate_limits']
  loop
    execute format('drop policy if exists deny_client_all on public.%I;', t);
    execute format(
      'create policy deny_client_all on public.%I for all to authenticated, anon using (false) with check (false);', t);
  end loop;
end $$;
