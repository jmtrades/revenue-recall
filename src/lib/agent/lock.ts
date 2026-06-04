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
