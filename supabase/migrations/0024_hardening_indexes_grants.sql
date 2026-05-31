-- Launch hardening: cover foreign keys with indexes, and remove needless
-- API exposure of internal SECURITY DEFINER helpers.
--
-- Both come straight from the Supabase database linter (performance +
-- security advisors). Safe and idempotent.

-- 1) Index every foreign key that lacked a covering index. Without these,
--    FK lookups and cascade deletes do sequential scans, and the planner
--    can't use the FK for joins. (Advisor: unindexed_foreign_keys.)
create index if not exists idx_act_contact      on public.activities    (contact_id);
create index if not exists idx_act_org          on public.activities    (org_id);
create index if not exists idx_outbox_contact   on public.agent_outbox  (contact_id);
create index if not exists idx_outbox_deal      on public.agent_outbox  (deal_id);
create index if not exists idx_outbox_task      on public.agent_outbox  (task_id);
create index if not exists idx_opp_contact      on public.opportunities (contact_id);
create index if not exists idx_opp_pipeline     on public.opportunities (pipeline_id);
create index if not exists idx_pipelines_org    on public.pipelines     (org_id);
create index if not exists idx_stages_pipeline  on public.stages        (pipeline_id);

-- 2) Tighten SECURITY DEFINER helper grants so they aren't callable through
--    the public REST/RPC API by anonymous clients. (Advisor:
--    anon_security_definer_function_executable.)
--
--    current_org_id() is referenced inside RLS policies, so the `authenticated`
--    role MUST retain EXECUTE (policy evaluation calls it as the querying
--    role); we only drop the anonymous/PUBLIC grant. anon would get NULL from
--    it anyway (no auth.uid()).
revoke execute on function public.current_org_id() from public, anon;
grant  execute on function public.current_org_id() to authenticated, service_role;

--    rls_auto_enable() is a DDL event-trigger helper — never a legitimate API
--    call. Event triggers still fire under the owner regardless of these
--    grants, so revoking direct EXECUTE breaks nothing.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
