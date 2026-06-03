import { getSupabase } from "@/lib/supabase/client";

/**
 * Short-TTL advisory locks for scheduled work, so the same unit (e.g. an org's
 * cadence sending) can't run concurrently across two overlapping cron
 * invocations — which would double-send to a prospect. A crashed holder's lock
 * auto-expires after the TTL, so the next run can always make progress.
 *
 * With no database (single-process demo) there's no concurrency to guard, so
 * acquire is a no-op success.
 */

/** Try to take the lock. Returns true if acquired (caller must releaseCronLock
 *  in a finally), false if another live holder has it. */
export async function acquireCronLock(key: string, ttlMs = 120_000): Promise<boolean> {
  const client = getSupabase();
  if (!client) return true;
  const now = Date.now();
  // Clear our own key if its prior holder's lock has expired (crash recovery).
  await client.from("cron_locks").delete().eq("key", key).lt("expires_at", new Date(now).toISOString());
  // Atomic claim: the primary key makes a concurrent insert fail (→ not acquired).
  const { error } = await client.from("cron_locks").insert({ key, expires_at: new Date(now + ttlMs).toISOString() });
  return !error;
}

export async function releaseCronLock(key: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  await client.from("cron_locks").delete().eq("key", key);
}
