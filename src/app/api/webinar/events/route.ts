import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { verifyInboundOrgToken } from "@/lib/inbound-routing";
import { runWithOrg } from "@/lib/supabase/org-context";
import { secretForProvider } from "@/lib/webinar/config";
import { ingestWebinarEvent, resolveWebinarOrg } from "@/lib/webinar/engine";
import { normalizeWebinarEvents, zoomValidationToken } from "@/lib/webinar/normalize";
import { verifyWebinarRequest, zoomEncryptedToken } from "@/lib/webinar/verify";
import { logInfo } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Real-time webinar webhooks. The live-leave call is placed inside this request
 * (not on a cron) so the gap from "they left" to "we're dialing" stays under a
 * second once the provider has delivered the event.
 *
 * Point Zoom, Demio, GoTo, WebinarJam, or any relay here. Authenticate with
 * WEBINAR_WEBHOOK_SECRET (HMAC header or ?token=) or the provider-specific secret.
 * Multi-tenant URLs carry ?org=&t= (see webinarWebhookUrl).
 */
export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "webinar-events"), 6000, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  const provider = (req.headers.get("x-webinar-provider") || url.searchParams.get("provider") || "generic").toLowerCase();
  const raw = await req.text();
  const verdict = verifyWebinarRequest({ provider, rawBody: raw, headers: req.headers, url });
  if (!verdict.ok) return NextResponse.json({ error: "Unauthorized", reason: verdict.reason }, { status: 401 });

  let body: unknown = null;
  if (raw.trim()) {
    const form = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
    if (form) {
      body = Object.fromEntries(new URLSearchParams(raw));
    } else {
      try {
        body = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
    }
  }

  const plain = zoomValidationToken(body);
  if (plain) {
    const secret = secretForProvider("zoom");
    if (!secret) return NextResponse.json({ error: "Zoom secret is not configured" }, { status: 401 });
    return NextResponse.json({ plainToken: plain, encryptedToken: zoomEncryptedToken(secret, plain) });
  }

  const orgParam = url.searchParams.get("org");
  if (orgParam && !verifyInboundOrgToken(orgParam, url.searchParams.get("t"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = await resolveWebinarOrg(orgParam);
  if (!orgId) return NextResponse.json({ error: "Org could not be resolved. Use the org-scoped webhook URL." }, { status: 400 });

  const events = normalizeWebinarEvents(provider, body);
  if (!events.length) return NextResponse.json({ ok: true, ignored: "no_events" });

  const receivedAt = Date.now();
  const run = async () => {
    const results = [];
    for (const event of events) results.push(await ingestWebinarEvent(orgId, event, receivedAt));
    return results;
  };
  const results = orgParam ? await runWithOrg(orgParam, run) : await run();
  const latencyMs = results.find((r) => r.latencyMs !== undefined)?.latencyMs;
  logInfo("webinar.webhook", { provider, orgId, events: events.length, latencyMs });
  try {
    const { captureWebinarEvents } = await import("@/lib/roi/capture");
    await captureWebinarEvents(orgId, events);
  } catch {
    /* attendance is already ingested; the results ledger must not fail the webhook */
  }
  return NextResponse.json({ ok: true, results, latencyMs });
});

/** GoTo validates the callback URL with a GET that must return 200. */
export function GET() {
  return new NextResponse(null, { status: 200 });
}
