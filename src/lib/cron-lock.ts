import { getSupabase } from "@/lib/supabase/client";

/**
 * Advisory locks for scheduled work, so the same unit (e.g. an org's cadence
 * sending) can't run concurrently across two overlapping cron invocations —
 * which would double-send to a prospect. A crashed holder's lock auto-expires
 * after the TTL.
 *
 * The default TTL MUST outlive the longest a lock-holder can run, or the lock
 * expires mid-run and an overlapping invocation acquires it and double-sends —
 * defeating the whole guard. The sending crons set maxDuration=300s, so the
 * default is 600s (well past that, still short enough that a truly crashed run
 * frees the lock long before the next hourly tick). Pass a larger ttlMs for any
 * longer job.
 *
 * acquire returns a FENCE token (the exact expires_at it wrote) which release
 * must present, so a slow run whose lock has already expired and been re-taken
 * by another run cannot delete that newer run's lock (a lost-mutex / steal).
 *
 * With no database (single-process demo) there's no concurrency to guard, so
 * acquire returns a sentinel fence and release is a no-op.
 */

const NO_DB_FENCE = "no-db";

/** Take the lock. Returns a fence token to pass to releaseCronLock, or null if
 *  another live holder has it. TTL defaults to 600s — longer than the 300s
 *  maxDuration of the sending crons so the lock never expires mid-run. */
export async function acquireCronLock(key: string, ttlMs = 600_000): Promise<string | null> {
  const client = getSupabase();
  if (!client) return NO_DB_FENCE;
  const now = Date.now();
  // Clear our own key only if the prior holder's lock has expired (crash recovery).
  await client.from("cron_locks").delete().eq("key", key).lt("expires_at", new Date(now).toISOString());
  // A small random offset guarantees the fence is unique even if two runs hit
  // the same millisecond, so release can't match the wrong holder's row.
  const fence = new Date(now + ttlMs + Math.floor(Math.random() * 1000)).toISOString();
  const { error } = await client.from("cron_locks").insert({ key, expires_at: fence });
  return error ? null : fence; // unique-violation → another holder has it
}

/** Release the lock ONLY if we still hold it (our fence is current). */
export async function releaseCronLock(key: string, fence: string): Promise<void> {
  const client = getSupabase();
  if (!client || fence === NO_DB_FENCE) return;
  await client.from("cron_locks").delete().eq("key", key).eq("expires_at", fence);
}
