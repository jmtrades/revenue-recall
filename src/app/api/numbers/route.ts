import { NextResponse } from "next/server";
import { z } from "zod";
import { searchNumbers, buyNumber, listOwnedNumbers, numbersConfigured, numbersProviderId, outboundFromNumber } from "@/lib/numbers";
import { getOrgSettings, updateOrgSettings } from "@/lib/org";

export const dynamic = "force-dynamic";

/** Owned numbers + provider status + this org's current caller ID. */
export async function GET() {
  const [owned, org] = await Promise.all([listOwnedNumbers().catch(() => []), getOrgSettings().catch(() => null)]);
  return NextResponse.json({ configured: numbersConfigured(), provider: numbersProviderId(), byoNumber: outboundFromNumber() ?? null, callerId: org?.callerId ?? null, owned });
}

const Body = z.object({
  action: z.enum(["search", "buy", "set_caller_id"]),
  areaCode: z.string().max(8).optional(),
  country: z.string().max(4).optional(),
  contains: z.string().max(20).optional(),
  number: z.string().max(20).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

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
    const bought = await buyNumber(parsed.data.number);
    return NextResponse.json({ bought });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
  }
}
