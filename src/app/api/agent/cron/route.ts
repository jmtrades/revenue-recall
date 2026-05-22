import { NextResponse } from "next/server";
import { listTasks } from "@/lib/agent/store";
import { runTask } from "@/lib/agent/engine";

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
  return NextResponse.json({ ok: true, ran: results.length, results });
}
