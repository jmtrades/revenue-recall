-- Opt-in cadence batching (SEQUENCE_BATCH=true): when on, the cadence runtime
-- submits its due email/SMS drafts to the Anthropic Batches API (~50% cheaper)
-- instead of drafting each synchronously. Because batches are async (results
-- arrive minutes-to-an-hour later), we persist the submitted batch + the routing
-- map (which draft belongs to which deal/contact/channel) so a later cron tick
-- can collect the results and queue them to Approvals. `items` is the routing
-- map; no draft bodies are stored (those come back from the batch).

create table if not exists ai_batches (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  provider_batch_id text not null,
  status            text not null default 'pending' check (status in ('pending','collected','failed')),
  items             jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  collected_at      timestamptz
);

create index if not exists idx_ai_batches_org_status on ai_batches(org_id, status);

alter table ai_batches enable row level security;
drop policy if exists org_rw_ai_batches on ai_batches;
create policy org_rw_ai_batches on ai_batches
  using (org_id = current_org_id()) with check (org_id = current_org_id());
