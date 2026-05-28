import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/inbound";
import { verifyTwilioSignature } from "@/lib/webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function tokenOk(url: URL): boolean {
  const token = process.env.INBOUND_TOKEN;
  if (!token) return true;
  return url.searchParams.get("token") === token;
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
  return tokenOk(url);
}

/** Twilio inbound SMS webhook (application/x-www-form-urlencoded). */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const params: Record<string, string> = {};
  if (form) for (const [k, v] of form.entries()) params[k] = String(v);

  if (!authorized(req, url, params)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = params.From ?? "";
  const body = params.Body ?? "";
  if (!from || !body) return new NextResponse(TWIML, { headers: { "Content-Type": "text/xml" } });

  await handleInbound("sms", from, body).catch(() => undefined);
  // Empty TwiML: we handle replies ourselves (queue/auto-send), not via Twilio.
  return new NextResponse(TWIML, { headers: { "Content-Type": "text/xml" } });
}
