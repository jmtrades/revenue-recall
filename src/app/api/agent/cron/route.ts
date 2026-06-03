import { NextResponse } from "next/server";
import { listTasks } from "@/lib/agent/store";
import { runTask } from "@/lib/agent/engine";
import { runDueSteps, collectDueBatches } from "@/lib/cadence";
import { runDigests } from "@/lib/digest";
import { getSupabase } from "@/lib/supabase/client";
import { runWithOrg } from "@/lib/supabase/org-context";
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
  const tasks = (await listTasks()).filter((t) => t.enabled && t.trigger !== "manual");
  const results = [];
  for (const t of tasks) {
    const r = await runTask(t);
    results.push({ task: t.name, trigger: t.trigger, status: r.status, processed: r.itemsProcessed });
  }
  const cadence = await runDueSteps().catch((e) => ({ error: e instanceof Error ? e.message : "cadence failed" }));
  const batches = await collectDueBatches().catch((e) => ({ error: e instanceof Error ? e.message : "batch collect failed" }));
  const digests = await runDigests().catch((e) => ({ error: e instanceof Error ? e.message : "digests failed" }));
  return { ran: results.length, results, cadence, batches, digests };
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

  const secret = process.env.CRON_SECRET;
  const ids = await allOrgIds();
  if (!secret || ids.length <= 1) {
    // Single-tenant / demo / no-secret: run the active org inline.
    return NextResponse.json({ ok: true, orgs: ids.length, ...(await runForCurrentOrg()) });
  }

  const origin = url.origin;
  const results: Array<Record<string, unknown>> = [];
  for (const id of ids) {
    try {
      const r = await fetch(`${origin}/api/agent/cron?org=${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
      results.push({ org: id, status: r.status, result: await r.json().catch(() => null) });
    } catch (e) {
      results.push({ org: id, error: e instanceof Error ? e.message : "sub-request failed" });
    }
  }
  return NextResponse.json({ ok: true, orgs: ids.length, fanned: true, results });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(req);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(req);
}
