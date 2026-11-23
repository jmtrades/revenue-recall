import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { verifyInboundOrgToken } from "@/lib/inbound-routing";
import { runWithOrg } from "@/lib/supabase/org-context";
import { ingestWebinarEvent, resolveWebinarOrg } from "@/lib/webinar/engine";
import { recordBeacon, type BeaconBody } from "@/lib/webinar/presence";
import { secretForProvider } from "@/lib/webinar/config";
import { safeEqual } from "@/lib/safe-compare";
import { logInfo } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Presence beacon for platforms with no leave webhook. The snippet on a page
 * the org controls posts join, heartbeat, and leave. A leave is ingested in
 * this request, so the recovery call starts before the response returns.
 */
function tokenOk(url: URL, provider: string): boolean {
  const secret = secretForProvider(provider);
  const production = process.env.NODE_ENV === "production";
  if (!secret) return !production;
  const token = url.searchParams.get("token") ?? url.searchParams.get("t") ?? "";
  if (token && safeEqual(token, secret)) return true;
  const org = url.searchParams.get("org");
  if (org && verifyInboundOrgToken(org, url.searchParams.get("t"))) return true;
  return false;
}

export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "webinar-beacon"), 12000, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") || "beacon").toLowerCase();
  if (!tokenOk(url, provider)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as BeaconBody | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const orgId = await resolveWebinarOrg(url.searchParams.get("org"));
  if (!orgId) return NextResponse.json({ error: "Org could not be resolved" }, { status: 400 });

  const event = recordBeacon(orgId, { ...body, provider: body.provider || provider });
  if (!event) return NextResponse.json({ ok: true, ignored: "no_change" });
  const receivedAt = Date.now();
  const run = () => ingestWebinarEvent(orgId, event, receivedAt);
  const result = url.searchParams.get("org") ? await runWithOrg(url.searchParams.get("org")!, run) : await run();
  if (result.latencyMs !== undefined) logInfo("webinar.beacon_leave", { orgId, latencyMs: result.latencyMs });
  return NextResponse.json({ ok: true, ...result });
});
