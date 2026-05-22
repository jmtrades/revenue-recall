import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/inbound";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(url: URL): boolean {
  const token = process.env.INBOUND_TOKEN;
  if (!token) return true;
  return url.searchParams.get("token") === token;
}

const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Twilio inbound SMS webhook (application/x-www-form-urlencoded). */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!authorized(url)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const from = String(form?.get("From") ?? "");
  const body = String(form?.get("Body") ?? "");
  if (!from || !body) return new NextResponse(TWIML, { headers: { "Content-Type": "text/xml" } });

  await handleInbound("sms", from, body).catch(() => undefined);
  // Empty TwiML: we handle replies ourselves (queue/auto-send), not via Twilio.
  return new NextResponse(TWIML, { headers: { "Content-Type": "text/xml" } });
}
