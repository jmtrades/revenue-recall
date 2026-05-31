import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/crm/registry";
import { placeCall } from "@/lib/comms";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const Body = z.object({ dealId: z.string().optional(), contactId: z.string().optional(), to: z.string().optional() });

export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "call").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const provider = getProvider();
  let to = parsed.data.to;
  let contactId = parsed.data.contactId;

  if (!to && parsed.data.dealId) {
    const opp = await provider.getOpportunity(parsed.data.dealId);
    contactId = contactId ?? opp?.contactId;
  }
  if (!to && contactId) {
    const c = await provider.getContact(contactId);
    to = c?.points.find((p) => p.channel === "phone")?.value;
  }
  if (!to) return NextResponse.json({ error: "No phone number on file" }, { status: 400 });

  const result = await placeCall(to);
  if (result.status === "failed") return NextResponse.json({ error: result.detail ?? "Call failed" }, { status: 502 });
  return NextResponse.json({ ok: true, to, ...result });
});
