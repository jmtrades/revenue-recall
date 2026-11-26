import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { planTeamReply, recordTeamEvent } from "@/lib/agent/team";
import { isHardOptOut } from "@/lib/agent/guardrails";
import { isAiConfigured } from "@/lib/ai/client";
import { draftReply } from "@/lib/ai/reply";

export const dynamic = "force-dynamic";

/**
 * Public web chat. Works with templates when Anthropic is unset. The widget
 * posts here; nothing is sent to Meta or email.
 */
export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "webchat"), 30, 60_000).ok) {
    return NextResponse.json({ error: "Too many messages" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { message?: string; sessionId?: string; name?: string } | null;
  const message = (body?.message ?? "").trim().slice(0, 2000);
  if (!message) return NextResponse.json({ error: "Say something first." }, { status: 400 });
  const sessionId = (body?.sessionId ?? "web").slice(0, 80);
  if (isHardOptOut(message)) {
    return NextResponse.json({ ok: true, paused: true, reply: "You're opted out. I won't message you again." });
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const bookingUrl = process.env.BOOKING_URL || (host ? `${proto}://${host}/book/local` : "/book/local");
  const plan = planTeamReply({ text: message, channel: "web", seed: sessionId, bookingUrl });
  let reply = plan.body;
  if (isAiConfigured() && !plan.paused) {
    const drafted = await draftReply({
      channel: "sms",
      contactName: body?.name || "there",
      dealTitle: "Website chat",
      incoming: message,
    }).catch(() => null);
    if (drafted?.body?.trim()) reply = drafted.body;
  }
  recordTeamEvent({ at: new Date().toISOString(), role: plan.role, outcome: "reply", channel: "web" });
  return NextResponse.json({ ok: true, reply, role: plan.role, action: plan.action, variantId: plan.variantId });
});
