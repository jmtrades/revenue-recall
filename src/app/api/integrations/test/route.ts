import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { integrationStatus } from "@/lib/integrations/status";
import { sendEmail, sendSms, placeCall } from "@/lib/comms";
import { callVoiceProfile } from "@/lib/voice/tts";

export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.string().max(40),
  to: z.string().max(200).optional(),
});

/**
 * One test send to an address the caller typed. Refuses when the key is
 * missing, and says so — it never pretends a logged no-op was a real send.
 */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const row = integrationStatus().find((r) => r.id === parsed.data.id);
  if (!row) return NextResponse.json({ error: "Unknown integration" }, { status: 400 });
  if (!row.ok) return NextResponse.json({ ok: false, message: `${row.label} isn't connected. Add ${row.missing} on the host and restart.` }, { status: 503 });
  const to = (parsed.data.to ?? "").trim();
  if (row.test === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "Enter the email address to send the test to." }, { status: 400 });
    const result = await sendEmail(to, "Revenue Recall test", "This is a test from your workspace. If you can read it, email is connected.");
    if (result.status === "failed" || result.status === "logged") {
      return NextResponse.json({ ok: false, message: result.detail || "Email did not leave this server. The key is set, but the provider did not accept it." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, message: `Test email queued to ${to}.` });
  }
  if (row.test === "sms" || row.test === "call") {
    if (!/^[+]?[0-9][0-9\s().-]{5,38}$/.test(to)) return NextResponse.json({ error: "Enter the phone number to send the test to." }, { status: 400 });
    const result = row.test === "sms"
      ? await sendSms(to, "Revenue Recall test. If you got this, SMS is connected.")
      : await placeCall(to, { ...callVoiceProfile(), opener: "Hey, this is a test call from your workspace. You can hang up.", voicemail: "Hey, this is a short test voicemail. You can ignore it." });
    if (result.status === "failed" || result.status === "logged") {
      return NextResponse.json({ ok: false, message: result.detail || `The ${row.test} did not leave this server.` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, message: `Test ${row.test} queued to ${to}.` });
  }
  return NextResponse.json({ ok: true, message: `${row.label} is configured. There is nothing to send.` });
});
