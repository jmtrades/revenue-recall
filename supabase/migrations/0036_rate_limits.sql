-- Cross-instance rate limiting for security-sensitive endpoints (login / signup /
-- password reset). The in-memory limiter is per-serverless-instance, so the
-- effective cap is N_instances × limit; this shared fixed-window counter makes
-- the cap real across instances. No tenant data (just counters); RLS on with no
-- policy so only the service-role (the server) touches it.
create table if not exists rate_limits (
  key text not null,
  window_start bigint not null,
  count int not null default 0,
  primary key (key, window_start)
);
alter table rate_limits enable row level security;

-- Atomic increment: insert-or-bump the counter for this (key, window) and return
-- the new count. The primary key collapses concurrent requests, so the returned
-- count is exact under load — no read-modify-write race.
create or replace function incr_rate_limit(p_key text, p_window bigint)
returns int
language sql
as $$
  insert into rate_limits (key, window_start, count)
  values (p_key, p_window, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count;
$$;
