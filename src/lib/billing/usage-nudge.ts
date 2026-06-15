import { enforcementOn } from "@/lib/billing/enforce";
import { publicSiteUrl } from "@/lib/site";
import { voiceMinutesMeter, estimatedDialsForMinutes } from "@/lib/billing/voice-minutes";
import { usageMeter } from "@/lib/ai/usage";
import { topupPacksFor } from "@/lib/billing/topups";
import { ownerEmailsForOrg } from "@/lib/billing/lifecycle";
import { sendEmail } from "@/lib/comms";
import { seenInboundEvent, forgetInboundEvent } from "@/lib/inbound-dedup";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { logInfo } from "@/lib/log";

/**
 * Usage-runway nudge — the proactive side of the in-app meters. The meters only
 * help someone already staring at Settings; the failure mode that actually
 * churns customers is silent: the org burns through its talk minutes mid-month,
 * AI calling quietly pauses, and nobody notices until the pipeline goes cold.
 * This emails the owner when a monthly pool crosses 80% ("low") and again at
 * 100% ("out"), with the top-up packs right in the body — it's simultaneously
 * the anti-stall safeguard and the top-up revenue loop.
 *
 * Runs on the per-org cron tick. Only when billing is enforced (with no Stripe
 * the meters are decorative — never nag a demo) and only with Supabase (the
 * dedupe must be durable; an hourly cron with in-memory state would re-send
 * after every deploy). Deduped per org + calendar month + pool + stage, so an
 * org gets at most one "low" and one "out" per pool per month.
 */

export type NudgeStage = "low" | "out";

/** Fraction of the monthly pool that counts as "running low". */
export const LOW_FRACTION = 0.8;

/** Which nudge a pool deserves right now — null when unmetered, when the plan
 *  includes no pool at all (free orgs never had minutes to run out of), or when
 *  there's comfortably enough left. */
export function nudgeStage(used: number, limit: number): NudgeStage | null {
  if (!Number.isFinite(limit) || limit <= 0) return null;
  if (used >= limit) return "out";
  if (used / limit >= LOW_FRACTION) return "low";
  return null;
}

export interface PoolStatus {
  pool: "minutes" | "messages";
  stage: NudgeStage;
  remaining: number;
  limit: number;
}

const n = (v: number) => Math.floor(v).toLocaleString("en-US");

function appLink(path: string): string {
  const base = publicSiteUrl();
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

/** One line of pack options per pool, derived from the live catalog so a
 *  reprice flows into the email automatically. */
function packsLine(pool: PoolStatus["pool"]): string {
  return topupPacksFor(pool)
    .map((p) => `${p.actions.toLocaleString("en-US")} — $${p.suggestedUsd}`)
    .join(" · ");
}

/** Subject leads with the worst pool — minutes outrank messages because a
 *  paused dialer is the louder emergency. */
export function nudgeSubject(pools: PoolStatus[]): string {
  const minutes = pools.find((p) => p.pool === "minutes");
  const worst = pools.some((p) => p.stage === "out") ? "out" : "low";
  if (worst === "out") {
    return minutes && minutes.stage === "out"
      ? "You're out of talk minutes — AI calling is paused"
      : "You're out of AI messages this month";
  }
  return minutes ? `Running low: ~${n(minutes.remaining)} talk minutes left this month` : `Running low: ${n(pools[0].remaining)} AI messages left this month`;
}

/** Plaintext body covering every pool that's currently low/out. Pure so the
 *  framing — dials math, Approvals fallback, pack prices — is testable. */
export function nudgeBody(pools: PoolStatus[]): string {
  const lines: string[] = ["Quick heads-up on this month's usage at Revenue Recall:", ""];
  for (const p of pools) {
    if (p.pool === "minutes") {
      lines.push(
        p.stage === "out"
          ? `Talk minutes: 0 of ${n(p.limit)} left — AI calls are paused until you top up or the month resets. Everything else keeps running.`
          : `Talk minutes: ${n(p.remaining)} of ${n(p.limit)} left (≈${n(estimatedDialsForMinutes(p.remaining))} more dials at a normal mix — no-answers are free).`,
        `  Minute packs: ${packsLine("minutes")}`,
      );
    } else {
      lines.push(
        p.stage === "out"
          ? `AI messages: 0 of ${n(p.limit)} left — the AI rep keeps drafting to Approvals, it just can't auto-send until you top up.`
          : `AI messages: ${n(p.remaining)} of ${n(p.limit)} left this month.`,
        `  Message packs: ${packsLine("messages")}`,
      );
    }
    lines.push("");
  }
  lines.push("Packs stack onto this month and your plan is untouched. Pools reset on the 1st either way.", `Top up in Settings → Billing: ${appLink("/settings?tab=billing")}`);
  return lines.join("\n");
}

const monthKey = (now: Date) => now.toISOString().slice(0, 7); // YYYY-MM (UTC, same window as the meters)

export type UsageNudgeOutcome = "n/a" | "ok" | "sent" | "deduped" | "no_recipient" | "send_failed";

/** Check the current org's pools and send at most one nudge email. Best-effort
 *  by contract (the cron catches throws); a failed send un-marks the dedupe so
 *  the next tick retries instead of going silent for the month. */
export async function runUsageNudge(now: Date = new Date()): Promise<UsageNudgeOutcome> {
  if (!enforcementOn()) return "n/a";
  if (!isSupabaseConfigured()) return "n/a";

  const [voice, actions] = await Promise.all([voiceMinutesMeter(now), usageMeter(now)]);
  const pools: PoolStatus[] = [];
  const vStage = nudgeStage(voice.usedMin, voice.limitMin);
  if (vStage) pools.push({ pool: "minutes", stage: vStage, remaining: voice.remainingMin, limit: voice.limitMin });
  const aStage = nudgeStage(actions.used, actions.limit);
  if (aStage) pools.push({ pool: "messages", stage: aStage, remaining: actions.remaining, limit: actions.limit });
  if (pools.length === 0) return "ok";

  const orgId = (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
  if (!orgId) return "n/a";

  // Mark-on-check per pool+stage; only newly-crossed pools justify a send (the
  // email still shows every low pool for context). A pool that stays low all
  // month nudges once, not hourly.
  const month = monthKey(now);
  const keys = pools.map((p) => `${orgId}:${month}:${p.pool}:${p.stage}`);
  const fresh: string[] = [];
  for (const key of keys) if (!(await seenInboundEvent("usage-nudge", key))) fresh.push(key);
  if (fresh.length === 0) return "deduped";

  const to = await ownerEmailsForOrg(orgId);
  if (to.length === 0) return "no_recipient";

  const cta = { label: "Top up now", url: appLink("/settings?tab=billing") };
  let ok = false;
  for (const addr of to) {
    const r = await sendEmail(addr, nudgeSubject(pools), nudgeBody(pools), { internal: true, cta }).catch(() => null);
    if (r && r.status !== "failed") ok = true;
  }
  if (!ok) {
    // Give the dedupe back so the next tick retries — a transient email outage
    // must not eat the only warning the org gets this month.
    for (const key of fresh) await forgetInboundEvent("usage-nudge", key).catch(() => {});
    return "send_failed";
  }
  logInfo("billing.usage_nudge_sent", { orgId, pools: pools.map((p) => `${p.pool}:${p.stage}`).join(",") });
  return "sent";
}
