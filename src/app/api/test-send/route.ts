import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { z } from "zod";
import { sendEmail, sendSms } from "@/lib/comms";
import { writeRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({ channel: z.enum(["email", "sms"]), to: z.string().min(3).max(200) });

/** Send a one-off test message through the resolved transport so an operator can
 *  verify their connected email/SMS provider really delivers before going live. */
export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "test-send").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "channel and a valid recipient are required" }, { status: 400 });

  const { channel, to } = parsed.data;
  const body = "This is a test from Revenue Recall — your sending is wired up correctly.";
  const res = channel === "email" ? await sendEmail(to, "Revenue Recall — test send", body) : await sendSms(to, body);
  return NextResponse.json({ provider: res.provider, status: res.status, detail: res.detail });
});
