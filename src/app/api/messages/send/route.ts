import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveProvider } from "@/lib/crm/registry";
import { sendEmail, sendSms } from "@/lib/comms";
import { trackLinks } from "@/lib/tracking";
import { getOrgSettings } from "@/lib/org";
import { sendReply, isSocialChannel } from "@/lib/outbound";
import { platformTag } from "@/lib/social/ingest";
import type { SocialPlatform } from "@/lib/social/types";
import { writeRateLimit } from "@/lib/ratelimit";
import { recordRecallTouch } from "@/lib/recall/events";
import { hasOptedOut } from "@/lib/agent/guardrails";
import { sendReadiness } from "@/lib/channels/readiness";
import { withGuard } from "@/lib/api/guard";
import type { Activity, Opportunity } from "@/lib/crm/types";

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

export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "send").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const { channel, dealId, body, subject } = parsed.data;

  const provider = (await resolveProvider());
  let contactId = parsed.data.contactId;

  let opp: Opportunity | null = null;
  if (dealId) {
    opp = await provider.getOpportunity(dealId);
    if (!opp) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    contactId = contactId ?? opp.contactId;
  }

  // Compliance: never send to a contact who opted out / is marked do-not-contact —
  // the same gate the call route and the Approvals send enforce. This is a manual
  // send path, so it also closes the TOCTOU window where a contact replies "STOP"
  // after a list (e.g. the recall queue) was built but before the rep clicks send.
  // Loaded once for the contact and reused for BOTH the opt-out gate and the
  // duplicate-send guard below.
  let recentActs: Activity[] = [];
  if (contactId) {
    const contact = await provider.getContact(contactId);
    try {
      recentActs = provider.listActivitiesByContact ? await provider.listActivitiesByContact(contactId) : dealId ? await provider.listActivities(dealId) : [];
    } catch {
      /* attribute/tag opt-out flags below still apply */
    }
    if (hasOptedOut(contact ?? undefined, opp ?? undefined, recentActs)) {
      return NextResponse.json({ error: "This contact has opted out or is marked do-not-contact." }, { status: 403 });
    }
  }

  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  // Best-effort idempotency: catch a re-submitted send (the common case — an
  // impatient re-click after the first already succeeded, or a retried request) so
  // it doesn't deliver the same message to a prospect twice. If an identical
  // outbound message to this contact on this channel was logged seconds ago, treat
  // THIS call as that same send: succeed without sending again. (A retry after a
  // FAILED send logs nothing, so it correctly still goes through.) Note: two
  // *truly concurrent* POSTs can still both send — there's no DB uniqueness here;
  // the client's disabled-while-sending button covers that window.
  const isDuplicate = (kind: string, summary: string): boolean =>
    recentActs.some((a) => a.direction === "outbound" && a.kind === kind && a.summary === summary && nowMs - Date.parse(a.occurredAt) < 60_000);

  // Social reply — route back out on the platform it arrived on. Logged as a
  // "[Platform]"-tagged note so it lands in the same inbox thread as the inbound.
  if (isSocialChannel(channel)) {
    if (!contactId) return NextResponse.json({ error: "A contact is required to reply on social." }, { status: 400 });
    const contact = await provider.getContact(contactId);
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    const summary = `[${platformTag(channel as SocialPlatform)}] ${body}`;
    if (isDuplicate("note", summary)) return NextResponse.json({ ok: true, deduped: true });
    const result = await sendReply({ contact, channel: channel as SocialPlatform, body });
    if (result.status === "failed") {
      return NextResponse.json({ error: result.detail ?? "Send failed", provider: result.provider }, { status: 502 });
    }
    await provider.logActivity({
      contactId,
      kind: "note",
      summary,
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

  const summary = subject ? `${subject}\n\n${body}` : body;
  if (isDuplicate(channel, summary)) return NextResponse.json({ ok: true, deduped: true });

  const orgForSend = await getOrgSettings().catch(() => null);
  // Compliance gate (real sends only): when a real sender is connected but the
  // channel's prerequisites aren't met — no verified domain / postal address
  // (email) or no A2P 10DLC registration (SMS) — hold the send rather than
  // dispatch from an unauthenticated domain or unregistered number. Log-mode
  // (no real transport) and a fully-configured channel both pass through.
  const readiness = sendReadiness(channel === "email" ? "email" : "sms", orgForSend?.compliance?.address);
  if (readiness.state === "setup") {
    return NextResponse.json({ error: readiness.detail, blockers: readiness.blockers }, { status: 403 });
  }
  const from = channel === "sms" ? orgForSend?.callerId : undefined;
  const tracked = trackLinks(body, { orgId: orgForSend?.id, contactId: contactId ?? undefined, dealId: dealId ?? undefined, channel: channel === "email" ? "email" : "sms" });
  const result = channel === "email" ? await sendEmail(to, subject ?? "", tracked) : await sendSms(to, tracked, { from });
  if (result.status === "failed") {
    return NextResponse.json({ error: result.detail ?? "Send failed", provider: result.provider }, { status: 502 });
  }

  await provider.logActivity({
    opportunityId: dealId,
    contactId,
    kind: channel,
    summary,
    direction: "outbound",
    occurredAt: now,
  });

  // Attribute manual recall-queue sends so won-back ROI captures them too.
  if (parsed.data.recall) await recordRecallTouch({ dealId, contactId, channel: channel === "email" ? "email" : "sms", source: "manual", industry: orgForSend?.industryId });

  return NextResponse.json({ ok: true, ...result });
});
