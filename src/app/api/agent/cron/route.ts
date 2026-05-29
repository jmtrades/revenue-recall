import { NextResponse } from "next/server";
import { listTasks } from "@/lib/agent/store";
import { runTask } from "@/lib/agent/engine";
import { runDueSteps, collectDueBatches } from "@/lib/cadence";
import { runDigests } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs all enabled, non-manual Autopilot tasks. Wire to a scheduler (Vercel
 * Cron or Supabase scheduled function). Authorized via CRON_SECRET (Bearer) or
 * Vercel's cron header.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (req.headers.get("x-vercel-cron")) return true; // Vercel-signed cron invocation
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return false;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}

async function run() {
  const tasks = (await listTasks()).filter((t) => t.enabled && t.trigger !== "manual");
  const results = [];
  for (const t of tasks) {
    const r = await runTask(t);
    results.push({ task: t.name, trigger: t.trigger, status: r.status, processed: r.itemsProcessed });
  }
  // Advance any sequence enrollments whose next step is due.
  const cadence = await runDueSteps().catch((e) => ({ error: e instanceof Error ? e.message : "cadence failed" }));
  // Collect any finished draft batches (opt-in SEQUENCE_BATCH) into Approvals.
  const batches = await collectDueBatches().catch((e) => ({ error: e instanceof Error ? e.message : "batch collect failed" }));
  // Send any opted-in daily digest / task-reminder emails (once per day).
  const digests = await runDigests().catch((e) => ({ error: e instanceof Error ? e.message : "digests failed" }));
  return NextResponse.json({ ok: true, ran: results.length, results, cadence, batches, digests });
}
