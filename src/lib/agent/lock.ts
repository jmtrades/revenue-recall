import { resolveActiveOrgId } from "@/lib/supabase/active-org";

/**
 * Per-org advisory-lock key that serializes Autopilot sends. Without it, an
 * overlapping cron tick (a run exceeding the schedule interval) or a manual
 * "run now" racing the cron would both enumerate the same enabled tasks and
 * double-send to the same prospects — the cooldown guardrail can't catch it
 * because both runs read activities before either logs its sends. Shared by the
 * cron and the manual run route so they hold the SAME lock.
 */
export async function autopilotLockKey(): Promise<string> {
  const orgId = await resolveActiveOrgId();
  return `autopilot:${orgId ?? "default"}`;
}

/** Per-org lock for the daily/weekly digest. The per-day "already sent" dedup is
 *  check-then-send, not atomic across two overlapping ticks, so without this a
 *  duplicate cron tick could email the same digest to every user twice. */
export async function digestLockKey(): Promise<string> {
  const orgId = await resolveActiveOrgId();
  return `digest:${orgId ?? "default"}`;
}
