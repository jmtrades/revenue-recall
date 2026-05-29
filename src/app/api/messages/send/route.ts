import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/crm/registry";
import { sendEmail, sendSms } from "@/lib/comms";
import { writeRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({
  channel: z.enum(["email", "sms"]),
  dealId: z.string().optional(),
  contactId: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  if (!writeRateLimit(req, "send").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const { channel, dealId, body, subject } = parsed.data;

  const provider = getProvider();
  let contactId = parsed.data.contactId;
  let to = parsed.data.to;

  if (dealId) {
    const opp = await provider.getOpportunity(dealId);
    if (!opp) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    contactId = contactId ?? opp.contactId;
  }
  if (!to && contactId) {
    const contact = await provider.getContact(contactId);
    to = contact?.points.find((p) => p.channel === (channel === "email" ? "email" : "phone"))?.value;
  }
  if (!to) return NextResponse.json({ error: "No destination address/number" }, { status: 400 });

  const result = channel === "email" ? await sendEmail(to, subject ?? "", body) : await sendSms(to, body);
  if (result.status === "failed") {
    return NextResponse.json({ error: result.detail ?? "Send failed", provider: result.provider }, { status: 502 });
  }

  await provider.logActivity({
    opportunityId: dealId,
    contactId,
    kind: channel,
    summary: subject ? `${subject}\n\n${body}` : body,
    direction: "outbound",
    occurredAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, ...result });
}
