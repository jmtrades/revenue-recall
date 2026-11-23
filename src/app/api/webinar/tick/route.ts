import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { safeEqual } from "@/lib/safe-compare";
import { runWithOrg } from "@/lib/supabase/org-context";
import { getSupabase } from "@/lib/supabase/client";
import { tickWebinarRecovery } from "@/lib/webinar/engine";
import { sendAlert } from "@/lib/alert";
import { errMessage } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fires due webinar recovery steps (redials, SMS, email) that were not due at
 * webhook time. Schedule this every minute. The live-leave call does not wait
 * for it — that dial happens inside POST /api/webinar/events.
 *
 * Org id is an explicit argument on the store, so unlike the autopilot cron
 * this can walk tenants inline without leaking one org's cached settings.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (secret) return safeEqual(header, `Bearer ${secret}`);
  if (req.headers.get("x-vercel-cron")) return true;
  return process.env.NODE_ENV !== "production";
}

async function allOrgIds(): Promise<string[]> {
  const client = getSupabase();
  if (!client) return [];
  const { data } = await client.from("orgs").select("id").order("created_at", { ascending: true });
  return (data ?? []).map((r) => (r as { id: string }).id);
}

async function tick(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const target = url.searchParams.get("org");
  if (target) {
    const result = await runWithOrg(target, () => tickWebinarRecovery(target));
    return NextResponse.json({ ok: true, ...result });
  }

  const orgs = await allOrgIds();
  if (orgs.length === 0) {
    const result = await tickWebinarRecovery();
    return NextResponse.json({ ok: true, ...result });
  }

  const results = [];
  for (const org of orgs) {
    try {
      results.push(await runWithOrg(org, () => tickWebinarRecovery(org)));
    } catch (err) {
      const error = errMessage(err);
      results.push({ orgId: org, error });
      await sendAlert("webinar.tick", { orgId: org, error });
    }
  }
  return NextResponse.json({ ok: results.every((r) => !("error" in r)), orgs: results });
}

export const GET = withGuard((req) => tick(req));
export const POST = GET;
