import { NextResponse } from "next/server";
import { z } from "zod";
import { getOutboxItem, setOutboxStatus } from "@/lib/agent/store";
import { getProvider } from "@/lib/crm/registry";
import { sendReply, isSocialChannel } from "@/lib/outbound";
import { hasOptedOut } from "@/lib/agent/guardrails";
import { platformTag } from "@/lib/social/ingest";
import type { SocialPlatform } from "@/lib/social/types";
import type { Activity } from "@/lib/crm/types";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const Body = z.object({ action: z.enum(["approve", "dismiss"]) });

export const POST = withGuard(async (req: Request, { params }: { params: { id: string } }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "action required" }, { status: 400 });

  const item = await getOutboxItem(params.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.status !== "pending") return NextResponse.json({ error: "Already handled" }, { status: 409 });

  if (parsed.data.action === "dismiss") {
    await setOutboxStatus(item.id, "dismissed");
    return NextResponse.json({ ok: true, status: "dismissed" });
  }

  // approve → send + log. The unified outbound seam resolves the right transport
  // and address (email/phone/social id) for the contact, so email, SMS, and all
  // six social platforms send through one path.
  const provider = getProvider();
  if (!item.contactId) return NextResponse.json({ error: "No contact on file" }, { status: 400 });
  const contact = await provider.getContact(item.contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  // Re-check opt-out at SEND time, not just when the draft was queued — a contact
  // may have replied "STOP" (or unsubscribed) while the draft sat in Approvals.
  let activities: Activity[] = [];
  try {
    if (provider.listActivitiesByContact) activities = await provider.listActivitiesByContact(item.contactId);
    else if (item.dealId) activities = await provider.listActivities(item.dealId);
  } catch {
    /* best-effort */
  }
  const opp = item.dealId ? await provider.getOpportunity(item.dealId).catch(() => null) : null;
  if (hasOptedOut(contact, opp ?? undefined, activities)) {
    await setOutboxStatus(item.id, "dismissed");
    return NextResponse.json({ error: "This contact has opted out — not sending." }, { status: 403 });
  }

  const res = await sendReply({ contact, channel: item.channel, subject: item.subject, body: item.body });
  if (res.status === "failed") return NextResponse.json({ error: res.detail ?? "Send failed" }, { status: 502 });

  const social = isSocialChannel(item.channel);
  // Social sends are logged as tagged notes so they round-trip into the inbox
  // thread; email/sms keep their native kind.
  const kind: "email" | "sms" | "note" = social ? "note" : (item.channel as "email" | "sms");
  await provider.logActivity({
    opportunityId: item.dealId,
    contactId: item.contactId,
    kind,
    summary: social
      ? `[${platformTag(item.channel as SocialPlatform)}] ${item.body}`
      : item.subject ? `${item.subject}\n\n${item.body}` : item.body,
    direction: "outbound",
    occurredAt: new Date().toISOString(),
  });
  await setOutboxStatus(item.id, "sent");
  return NextResponse.json({ ok: true, status: "sent", provider: res.provider });
});
