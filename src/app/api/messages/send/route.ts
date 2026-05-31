import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/crm/registry";
import { sendEmail, sendSms } from "@/lib/comms";
import { sendReply, isSocialChannel } from "@/lib/outbound";
import { platformTag } from "@/lib/social/ingest";
import type { SocialPlatform } from "@/lib/social/types";
import { writeRateLimit } from "@/lib/ratelimit";
import { recordRecallTouch } from "@/lib/recall/events";

export const dynamic = "force-dynamic";

const Body = z.object({
  channel: z.enum(["email", "sms", "whatsapp", "instagram", "messenger", "telegram", "x", "linkedin"]),
  dealId: z.string().optional(),
  contactId: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().min(1).max(4000),
  /** Set by the recall queue so the send is attributed to the recall effort. */
  recall: z.boolean().optional(),
});

export async function POST(req: Request) {
  if (!writeRateLimit(req, "send").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const { channel, dealId, body, subject } = parsed.data;

  const provider = getProvider();
  let contactId = parsed.data.contactId;

  if (dealId) {
    const opp = await provider.getOpportunity(dealId);
    if (!opp) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    contactId = contactId ?? opp.contactId;
  }

  const now = new Date().toISOString();

  // Social reply — route back out on the platform it arrived on. Logged as a
  // "[Platform]"-tagged note so it lands in the same inbox thread as the inbound.
  if (isSocialChannel(channel)) {
    if (!contactId) return NextResponse.json({ error: "A contact is required to reply on social." }, { status: 400 });
    const contact = await provider.getContact(contactId);
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    const result = await sendReply({ contact, channel: channel as SocialPlatform, body });
    if (result.status === "failed") {
      return NextResponse.json({ error: result.detail ?? "Send failed", provider: result.provider }, { status: 502 });
    }
    await provider.logActivity({
      contactId,
      kind: "note",
      summary: `[${platformTag(channel as SocialPlatform)}] ${body}`,
      direction: "outbound",
      occurredAt: now,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  // Email / SMS.
  let to = parsed.data.to;
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
    occurredAt: now,
  });

  // Attribute manual recall-queue sends so won-back ROI captures them too.
  if (parsed.data.recall) await recordRecallTouch({ dealId, contactId, channel, source: "manual" });

  return NextResponse.json({ ok: true, ...result });
}
