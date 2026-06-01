import { NextResponse } from "next/server";
import { z } from "zod";
import { markEmailBounced } from "@/lib/bounce";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";
import { verifyHmacSignature } from "@/lib/webhook";
import { logInfo, logWarn } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email(), type: z.string().max(80).optional() });

/** Bounce/complaint webhook. Point your ESP's bounce + spam-complaint events
 *  here so hard bounces stop further email to that address (sender-reputation
 *  protection). Same auth precedence as inbound email: INBOUND_SIGNING_SECRET
 *  (HMAC over raw body, fail-closed) → INBOUND_TOKEN → open-with-warning (dev). */
export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "inbound-bounce").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(req.url);
  const raw = await req.text();

  const signingSecret = process.env.INBOUND_SIGNING_SECRET;
  const token = process.env.INBOUND_TOKEN;
  if (signingSecret) {
    if (!verifyHmacSignature(signingSecret, raw, req.headers.get("x-rr-signature"))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (token) {
    if (url.searchParams.get("token") !== token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    logWarn("inbound.bounce.unauthenticated", { note: "set INBOUND_SIGNING_SECRET (preferred) or INBOUND_TOKEN" });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  // Only HARD/permanent bounces (and complaints) suppress; soft/transient ones
  // are ignored so a full mailbox or a blip doesn't kill a good address.
  const t = parsed.data.type ?? "";
  const hard = t === "" || /hard|permanent|complaint|spam|blocked|invalid|5\.\d|55\d/i.test(t);
  const flagged = hard ? await markEmailBounced(parsed.data.email) : 0;
  logInfo("inbound.bounce", { hard, flagged });
  return NextResponse.json({ ok: true, hard, flagged });
});
