-- Harden incr_rate_limit: pin search_path so a caller's search_path can't influence
-- the function (Supabase advisor 0011_function_search_path_mutable). With an empty
-- search_path nothing resolves implicitly, so fully-qualify the table (and alias it
-- so the ON CONFLICT upsert stays unambiguous).
create or replace function incr_rate_limit(p_key text, p_window bigint)
returns int
language sql
set search_path = ''
as $$
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, p_window, 1)
  on conflict (key, window_start) do update set count = rl.count + 1
  returning rl.count;
$$;
