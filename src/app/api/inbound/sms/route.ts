import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/inbound";
import { verifyTwilioSignature } from "@/lib/webhook";
import { verifyInboundOrgToken } from "@/lib/inbound-routing";
import { runWithOrg } from "@/lib/supabase/org-context";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { seenInboundEvent, forgetInboundEvent } from "@/lib/inbound-dedup";
import { safeEqual } from "@/lib/safe-compare";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function tokenOk(url: URL): boolean {
  const token = process.env.INBOUND_TOKEN;
  if (!token) return true;
  // Constant-time compare so the shared token can't be recovered via response timing.
  return safeEqual(url.searchParams.get("token") ?? "", token);
}

/**
 * Authorize an inbound SMS. When TWILIO_AUTH_TOKEN is set we require a valid
 * Twilio request signature (the request is provably from Twilio). Otherwise we
 * fall back to the shared INBOUND_TOKEN query param so the flow is still usable
 * in setups without Twilio.
 */
function authorized(req: Request, url: URL, params: Record<string, string>): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    return verifyTwilioSignature(authToken, req.url, params, req.headers.get("x-twilio-signature"));
  }
  if (process.env.INBOUND_TOKEN) return tokenOk(url);
  // No secret configured at all: accept only outside production (local/dev). In
  // prod, fail closed — an open inbound endpoint lets anyone forge a contact reply.
  return process.env.NODE_ENV !== "production";
}

/** Twilio inbound SMS webhook (application/x-www-form-urlencoded). */
export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, "inbound-sms"), 120, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const params: Record<string, string> = {};
  if (form) for (const [k, v] of form.entries()) params[k] = String(v);

  // Multi-tenant: an org-tagged URL (?org=&t=) authenticates via the per-org token
  // and routes to that tenant; otherwise fall back to the single-org auth.
  const orgParam = url.searchParams.get("org");
  if (orgParam) {
    if (!verifyInboundOrgToken(orgParam, url.searchParams.get("t"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (!authorized(req, url, params)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const from = params.From ?? "";
  const body = params.Body ?? "";
  if (!from || !body) return new NextResponse(TWIML, { headers: { "Content-Type": "text/xml" } });

  // Idempotency: Twilio retries on timeout — don't log + auto-reply twice.
  const messageSid = params.MessageSid ?? "";
  if (await seenInboundEvent("sms", messageSid)) {
    return new NextResponse(TWIML, { headers: { "Content-Type": "text/xml" } });
  }

  try {
    const run = () => handleInbound("sms", from, body);
    if (orgParam) await runWithOrg(orgParam, run);
    else await run();
  } catch {
    // Roll back the dedup marker so Twilio's retry can re-process — otherwise a
    // transient failure here silently drops the customer's reply (matches the
    // email route's fail-open contract).
    await forgetInboundEvent("sms", messageSid);
  }
  // Empty TwiML: we handle replies ourselves (queue/auto-send), not via Twilio.
  return new NextResponse(TWIML, { headers: { "Content-Type": "text/xml" } });
}
