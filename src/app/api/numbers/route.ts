import { NextResponse } from "next/server";
import { z } from "zod";
import { searchNumbers, buyNumber, listOwnedNumbers, numbersConfigured, numbersProviderId, outboundFromNumber } from "@/lib/numbers";
import { getOrgSettings, updateOrgSettings } from "@/lib/org";
import { inboundWebhookUrl } from "@/lib/inbound-routing";
import { requireRole } from "@/lib/authz";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Owned numbers + provider status + this org's current caller ID. */
export const GET = withGuard(async () => {
  const [owned, org] = await Promise.all([listOwnedNumbers().catch(() => []), getOrgSettings().catch(() => null)]);
  return NextResponse.json({ configured: numbersConfigured(), provider: numbersProviderId(), byoNumber: outboundFromNumber() ?? null, callerId: org?.callerId ?? null, owned });
});

const Body = z.object({
  action: z.enum(["search", "buy", "set_caller_id"]),
  areaCode: z.string().max(8).optional(),
  country: z.string().max(4).optional(),
  contains: z.string().max(20).optional(),
  number: z.string().max(20).optional(),
});

export const POST = withGuard(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Spending money (buy) or changing the org-wide caller ID is an owner/admin
  // action; browsing available numbers (search) stays open to any member.
  if (parsed.data.action !== "search") {
    const denied = await requireRole("owner", "admin");
    if (denied) return denied;
  }

  // Buying a number is a recurring monthly cost — cap it tightly so a scripted
  // loop can't provision a pile of paid numbers.
  if (parsed.data.action === "buy" && !rateLimit(clientKey(req, "number-buy"), 5, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Choosing this org's caller-ID number just stores it on the org — no provider needed.
  if (parsed.data.action === "set_caller_id") {
    const number = (parsed.data.number ?? "").trim();
    if (!number) return NextResponse.json({ error: "number required" }, { status: 400 });
    // This value becomes the outbound "From" on every call/text — reject anything
    // that isn't a real phone number so a typo can't silently break all sending.
    if (!/^[+]?[0-9][0-9\s().\-]{5,20}$/.test(number) || number.replace(/\D/g, "").length < 7) {
      return NextResponse.json({ error: "Enter a valid phone number in international format, e.g. +15551234567." }, { status: 400 });
    }
    try {
      const org = await updateOrgSettings({ callerId: number });
      return NextResponse.json({ callerId: org.callerId ?? null });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
    }
  }

  if (!numbersConfigured()) {
    return NextResponse.json({ error: "Connect a number provider to search or buy — set your Twilio credentials (TWILIO_ACCOUNT_SID/AUTH_TOKEN) or NUMBERS_WEBHOOK_URL." }, { status: 503 });
  }
  try {
    if (parsed.data.action === "search") {
      const results = await searchNumbers({ areaCode: parsed.data.areaCode, country: parsed.data.country, contains: parsed.data.contains });
      return NextResponse.json({ results });
    }
    if (!parsed.data.number) return NextResponse.json({ error: "number required" }, { status: 400 });
    // Make the bought number WORK out of the box:
    //  1. wire inbound webhooks so texts/calls to it route back to THIS org, and
    //  2. set it as the org caller ID so outbound calls/texts use it immediately.
    const org = await getOrgSettings().catch(() => null);
    const smsUrl = org?.id ? inboundWebhookUrl("sms", org.id) ?? undefined : undefined;
    const voiceUrl = process.env.TWILIO_INBOUND_VOICE_URL || undefined; // gateway TwiML endpoint, if deployed
    const bought = await buyNumber(parsed.data.number, { smsUrl, voiceUrl });
    const updated = await updateOrgSettings({ callerId: bought.number }).catch(() => null);
    return NextResponse.json({ bought, callerId: updated?.callerId ?? bought.number, inboundWired: Boolean(smsUrl) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
  }
});
