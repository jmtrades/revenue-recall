import { NextResponse } from "next/server";
import { listTasks } from "@/lib/agent/store";
import { runTask } from "@/lib/agent/engine";
import { runDueSteps, collectDueBatches } from "@/lib/cadence";
import { runCallRetries } from "@/lib/calls";
import { runDigests } from "@/lib/digest";
import { runBookingReminders } from "@/lib/meetings/reminders";
import { runCustomIdleAutomations } from "@/lib/automations/run-custom";
import { getSupabase } from "@/lib/supabase/client";
import { runWithOrg } from "@/lib/supabase/org-context";
import { autopilotLockKey, digestLockKey } from "@/lib/agent/lock";
import { sendAlert, isErrored } from "@/lib/alert";
import { cleanupRateLimits } from "@/lib/ratelimit";
import { ensureStripeCatalogCurrent } from "@/lib/billing/provision";
import { reconcileSubscriptions } from "@/lib/billing/reconcile";
import { runUsageNudge } from "@/lib/billing/usage-nudge";
import { runPlatformPulse } from "@/lib/platform-pulse";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { mapWithConcurrency } from "@/lib/async";
import { safeEqual } from "@/lib/safe-compare";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs all enabled, non-manual Autopilot tasks + cadence/digest ticks.
 *
 * Multi-tenant: the scheduler hits this with no org, so we enumerate every org
 * and process each one in ITS OWN sub-request (`?org=<id>`). That gives each org
 * a fresh request scope — critical because per-request helpers like
 * getOrgSettings() are React-`cache()`d with no org key, so looping orgs inline
 * in a single request would hand org B org A's cached settings. The sub-request
 * sets the org via runWithOrg() so every downstream provider/store call scopes
 * to it.
 *
 * Auth: when CRON_SECRET is set we REQUIRE `Authorization: Bearer <secret>`
 * (Vercel Cron sends this automatically when CRON_SECRET exists; our own
 * fan-out sub-requests send it too). The `x-vercel-cron` header is only trusted
 * as a fallback when no secret is configured (demo/single-tenant) — on its own
 * it's spoofable on non-Vercel hosts (e.g. Render), so it must never be the only
 * gate once a secret exists.
 */
/**
 * Dead-man's switch: ping a heartbeat URL (healthchecks.io / Better Uptime
 * style) after each successful platform tick. The monitor alerts when pings
 * STOP — catching the failure mode in-run alerting can't see: the cron not
 * firing at all (schedule disabled, broken deploy, CRON_SECRET mismatch).
 * Best-effort; never affects the tick.
 */
async function heartbeat(ok: boolean): Promise<void> {
  const url = process.env.CRON_HEARTBEAT_URL;
  if (!url || !ok) return;
  try {
    await fetch(url, { method: "POST", signal: AbortSignal.timeout(3000) });
  } catch {
    /* the monitor alerting on a missed ping IS the signal */
  }
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    return safeEqual(header, `Bearer ${secret}`);
  }
  return Boolean(req.headers.get("x-vercel-cron"));
}

/** Every org id (platform-level read — the one place the cron spans tenants). */
async function allOrgIds(): Promise<string[]> {
  const client = getSupabase();
  if (!client) return [];
  const { data } = await client.from("orgs").select("id").order("created_at", { ascending: true });
  return (data ?? []).map((r) => (r as { id: string }).id);
}

/** Process the CURRENTLY-active org (resolved from the runWithOrg override, the
 *  DEFAULT_ORG_ID, or the single-org fallback). */
async function runForCurrentOrg() {
  const results = [];
  // Serialize Autopilot per org: skip the task loop if another run (an
  // overlapping tick or a manual "run now") already holds the lock, so we never
  // double-send. Cadence/digests self-guard with their own locks/idempotency.
  const lockKey = await autopilotLockKey();
  const fence = await acquireCronLock(lockKey);
  if (fence) {
    try {
      const tasks = (await listTasks()).filter((t) => t.enabled && t.trigger !== "manual");
      for (const t of tasks) {
        const r = await runTask(t);
        results.push({ task: t.name, trigger: t.trigger, status: r.status, processed: r.itemsProcessed });
      }
    } finally {
      await releaseCronLock(lockKey, fence);
    }
  }
  const cadence = await runDueSteps().catch((e) => ({ error: e instanceof Error ? e.message : "cadence failed" }));
  // Execute due call retries (self-gated: only orgs with an enabled auto call
  // task; quiet hours / opt-outs / attempt budget enforced inside).
  const callRetries = await runCallRetries().catch((e) => ({ error: e instanceof Error ? e.message : "retries failed" }));
  const batches = await collectDueBatches().catch((e) => ({ error: e instanceof Error ? e.message : "batch collect failed" }));
  // Remind invitees before their booked meetings (self-dedups per booking; only
  // sends within the reminder window). Best-effort and never throws.
  const reminders = await runBookingReminders().catch((e) => ({ error: e instanceof Error ? e.message : "reminders failed" }));
  // Scan-based custom automation rules (deal_idle): fire each once per idle deal.
  const idleRules = await runCustomIdleAutomations().catch((e) => ({ error: e instanceof Error ? e.message : "idle rules failed" }));
  // Guard digests with a per-org lock: the per-day "already sent" check isn't
  // atomic, so two overlapping ticks could each pass it and email twice. The lock
  // closes the concurrent race; the existing dedup handles the sequential case.
  const digestKey = await digestLockKey();
  const digestFence = await acquireCronLock(digestKey);
  let digests: unknown = { skipped: "locked" };
  if (digestFence) {
    try {
      digests = await runDigests().catch((e) => ({ error: e instanceof Error ? e.message : "digests failed" }));
    } finally {
      await releaseCronLock(digestKey, digestFence);
    }
  }
  // Usage-runway nudge: email the owner when this month's talk minutes or AI
  // messages cross 80% / run out — the silent mid-month stall is the churn
  // moment the in-app meters alone can't catch. Self-deduped per pool per month.
  const usageNudge = await runUsageNudge().catch((e) => ({ error: e instanceof Error ? e.message : "usage nudge failed" }));
  // Surface engine errors to the operator — an autonomous tick that silently
  // errors every run would otherwise go unnoticed.
  for (const [stage, result] of Object.entries({ cadence, batches, digests, callRetries, reminders, idleRules, usageNudge })) {
    if (isErrored(result)) await sendAlert(`cron.${stage}`, { error: result.error });
  }
  return { ran: results.length, results, autopilotLocked: !fence, cadence, batches, digests, callRetries, reminders, idleRules, usageNudge };
}

/** Fan out: process every org in its own authenticated sub-request so each gets
 *  an isolated request scope. Falls back to an inline single-org run when there's
 *  no secret to authenticate sub-requests, or only one (or zero) orgs. */
async function run(req: Request) {
  const url = new URL(req.url);
  const targetOrg = url.searchParams.get("org");
  if (targetOrg) {
    const result = await runWithOrg(targetOrg, runForCurrentOrg);
    return NextResponse.json({ ok: true, org: targetOrg, ...result });
  }

  // Top-level tick only (not the per-org sub-requests): housekeep the shared
  // rate-limit counters so the table doesn't grow unbounded. Best-effort.
  await cleanupRateLimits();

  // Self-healing Stripe catalog: a reprice merged in code used to wait on a
  // human re-running /api/billing/setup; the platform now notices drift on its
  // hourly tick and provisions the new prices itself (idempotent; existing
  // subscribers grandfathered via transfer_lookup_key). Best-effort — pricing
  // upkeep must never block tenant work — but a heal/failure is alerted so
  // it's loud, not silent.
  const catalog = await ensureStripeCatalogCurrent().catch(() => "failed" as const);
  if (catalog === "healed" || catalog === "failed") {
    void sendAlert("billing.catalog.selfheal", { outcome: catalog });
  }

  // Stripe ↔ DB reconciliation: repair subscriptions that drifted from Stripe (a
  // webhook lost past its retry window, a dashboard edit, or a checkout whose
  // completed-event never landed → a paying customer stuck on free). Bounded per
  // tick, self-guards when billing isn't configured, alerts only when it actually
  // repairs/relinks something so drift is observable, not silent.
  const reconcile = await reconcileSubscriptions().catch(() => null);
  if (reconcile && (reconcile.repaired > 0 || reconcile.relinked > 0 || reconcile.errors > 0)) {
    void sendAlert("billing.reconcile", { ...reconcile });
  }

  // Operator's weekly platform pulse (Mondays, durable once-per-week dedupe;
  // inert without OPERATOR_EMAIL). Best-effort — never blocks tenant work.
  await runPlatformPulse().catch(() => {});

  const secret = process.env.CRON_SECRET;
  const ids = await allOrgIds();
  if (!secret || ids.length <= 1) {
    // Single-tenant / demo / no-secret: run the active org inline.
    const single = await runForCurrentOrg();
    await heartbeat(true);
    return NextResponse.json({ ok: true, orgs: ids.length, ...single });
  }

  const origin = url.origin;
  // Fan out with BOUNDED CONCURRENCY so the tick scales to many tenants within the
  // function budget, instead of N sequential round-trips that would time out at
  // scale. Every org is still processed exactly once per tick (no starvation), and
  // different orgs use different lock keys, so concurrency can't make a tenant
  // double-send. Tune with CRON_FANOUT_CONCURRENCY (default 6).
  const concurrency = Number(process.env.CRON_FANOUT_CONCURRENCY) || 6;
  // Per-org deadline so a single hung tenant can't hold a concurrency slot
  // forever and starve the rest (or silently consume the whole function budget).
  // On timeout the fetch aborts → mapWithConcurrency surfaces it as a per-org
  // failure (counted + alerted below), and the slot frees for the next org.
  const orgTimeoutMs = Number(process.env.CRON_ORG_TIMEOUT_MS) || 120_000;
  const settled = await mapWithConcurrency(ids, concurrency, async (id) => {
    const r = await fetch(`${origin}/api/agent/cron?org=${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(orgTimeoutMs),
    });
    return { org: id, status: r.status, result: await r.json().catch(() => null) };
  });
  const results: Array<Record<string, unknown>> = settled.map((s, i) =>
    s.ok ? s.value : { org: ids[i], status: 0, error: s.error instanceof Error ? s.error.message : "sub-request failed" },
  );
  // ok reflects the whole fan-out: if any tenant's sub-request errored (a 401
  // after secret rotation, a 500), the aggregate is NOT ok so monitoring sees it
  // instead of a falsely-green cron hiding a per-tenant outage.
  const failed = results.filter((r) => r.status !== 200).length;
  // Alert the operator when one or more tenants' ticks failed (e.g. a 401 after
  // secret rotation, or a 500) so a partial outage is noticed, not buried.
  if (failed > 0) await sendAlert("cron.fanout_partial_failure", { failed, orgs: ids.length, failures: results.filter((r) => r.status !== 200) });
  await heartbeat(failed === 0);
  return NextResponse.json({ ok: failed === 0, orgs: ids.length, fanned: true, failed, results });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(req);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(req);
}
