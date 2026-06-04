import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/crm/registry";
import { placeCall } from "@/lib/comms";
import { getActiveVoice } from "@/lib/voice";
import { getOrgSettings } from "@/lib/org";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";
import { hasOptedOut, recordingDisclosure } from "@/lib/agent/guardrails";
import type { Activity } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

const Body = z.object({ dealId: z.string().optional(), contactId: z.string().optional(), to: z.string().optional() });

export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "call").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const provider = getProvider();
  let to = parsed.data.to;
  let contactId = parsed.data.contactId;

  const opp = parsed.data.dealId ? await provider.getOpportunity(parsed.data.dealId) : null;
  if (opp) contactId = contactId ?? opp.contactId;
  const contact = contactId ? await provider.getContact(contactId) : null;
  if (!to) to = contact?.points.find((p) => p.channel === "phone")?.value;
  if (!to) return NextResponse.json({ error: "No phone number on file" }, { status: 400 });

  // Compliance gate: never dial someone who opted out or is marked do-not-contact.
  // Attribute-level flags are caught even if call history can't be loaded.
  let activities: Activity[] = [];
  try {
    if (contactId && provider.listActivitiesByContact) activities = await provider.listActivitiesByContact(contactId);
    else if (parsed.data.dealId) activities = await provider.listActivities(parsed.data.dealId);
  } catch {
    /* history is best-effort; attribute checks below still apply */
  }
  if (hasOptedOut(contact ?? undefined, opp ?? undefined, activities)) {
    return NextResponse.json({ error: "This contact has opted out or is marked do-not-contact." }, { status: 403 });
  }

  // Brief the in-house agent so it talks like it knows the prospect. Best-effort:
  // never let context-building block the call.
  let context: string | undefined;
  let opener: string | undefined;
  try {
    const voice = await getActiveVoice();
    const rep = voice.senderName?.trim();
    const first = (contact?.name ?? "").trim().split(/\s+/)[0] || "there";
    const bits: string[] = [];
    if (contact?.name) bits.push(`You're calling ${contact.name}${contact.company ? ` at ${contact.company}` : ""}.`);
    if (opp?.title) bits.push(`It's about "${opp.title}"${opp.value ? ` — worth ${opp.currency ?? ""}${opp.value.toLocaleString()}` : ""}.`);
    if (opp?.lossReason) bits.push("This deal went cold / was marked lost — you're re-engaging warmly, no guilt-trip.");
    if (voice.business) bits.push(`Your business: ${voice.business}`);
    if (rep) bits.push(`You are ${rep}.`);
    // Memory: brief the agent with the recent relationship history (most recent
    // last) so it speaks like it remembers prior touches, not from a blank slate.
    const recent = activities
      .slice(-5)
      .map((a) => {
        const when = a.occurredAt ? new Date(a.occurredAt).toISOString().slice(0, 10) : "";
        const text = (a.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
        return text ? `${when ? when + " " : ""}${a.direction ?? "out"} ${a.kind}: ${text}` : "";
      })
      .filter(Boolean);
    if (recent.length) bits.push(`Recent history with them (remember this, don't repeat yourself): ${recent.join(" | ")}.`);
    bits.push("Goal: land one real next step — a meeting or a clear yes.");
    context = bits.join(" ");
    opener = rep ? `Hey ${first}, it's ${rep} — caught you at an okay time?` : `Hey ${first} — caught you at an okay time?`;
  } catch {
    /* context is a nicety; place the call regardless */
  }

  // Recording disclosure (two-party-consent jurisdictions) is spoken first, even
  // if context-building above failed.
  const disclosure = recordingDisclosure();
  if (disclosure) opener = opener ? `${disclosure} ${opener}` : disclosure;

  // This org's settings: its own caller-ID number, and its id — both echoed by
  // the gateway back to /api/calls/log so the call dials from the right number
  // AND the transcript lands on the right tenant's timeline (not the first org).
  const org = await getOrgSettings().catch(() => null);
  const from = org?.callerId;

  // Tag the call so the gateway can echo it back to /api/calls/log and the
  // transcript attaches to the right record (and the right org).
  const meta: Record<string, string> = {};
  if (contactId) meta.contactId = contactId;
  if (parsed.data.dealId) meta.dealId = parsed.data.dealId;
  if (org?.id) meta.orgId = org.id;

  const result = await placeCall(to, { from, voiceId: org?.voiceId, context, opener, meta: Object.keys(meta).length ? meta : undefined });
  if (result.status === "failed") {
    // Most "failed" calls in practice are an unreachable gateway (wrong/empty
    // VOICE_WEBHOOK_URL, or the gateway service down) — point the user at the
    // self-diagnosing card instead of surfacing a raw fetch error.
    return NextResponse.json(
      { error: "Couldn't place the call — your calling gateway didn't respond. Check Settings → Channels → “Calling gateway”.", detail: result.detail },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, to, ...result });
});
