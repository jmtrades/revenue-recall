import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/inbound";
import { authorizeSecret } from "@/lib/security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Twilio inbound SMS webhook (application/x-www-form-urlencoded). */
export async function POST(req: Request) {
  const token = process.env.INBOUND_TOKEN;
  if (token && !authorizeSecret(req, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const from = String(form?.get("From") ?? "");
  const body = String(form?.get("Body") ?? "");
  if (!from || !body) return new NextResponse(TWIML, { headers: { "Content-Type": "text/xml" } });

  await handleInbound("sms", from, body).catch(() => undefined);
  // Empty TwiML: we handle replies ourselves (queue/auto-send), not via Twilio.
  return new NextResponse(TWIML, { headers: { "Content-Type": "text/xml" } });
}
