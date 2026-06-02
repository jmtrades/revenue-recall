import { NextResponse } from "next/server";
import { z } from "zod";
import { searchNumbers, buyNumber, listOwnedNumbers, numbersConfigured, numbersProviderId, outboundFromNumber } from "@/lib/numbers";

export const dynamic = "force-dynamic";

/** Owned numbers + provider status. */
export async function GET() {
  const owned = await listOwnedNumbers().catch(() => []);
  return NextResponse.json({ configured: numbersConfigured(), provider: numbersProviderId(), byoNumber: outboundFromNumber() ?? null, owned });
}

const Body = z.object({
  action: z.enum(["search", "buy"]),
  areaCode: z.string().max(8).optional(),
  country: z.string().max(4).optional(),
  contains: z.string().max(20).optional(),
  number: z.string().max(20).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
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
