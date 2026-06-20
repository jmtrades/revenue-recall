import { NextResponse } from "next/server";
import { oneLineUntrusted } from "@/lib/ai/untrusted";
import { signCallMeta } from "@/lib/calls/meta-sig";
import { z } from "zod";
import { resolveProvider } from "@/lib/crm/registry";
import { placeCall } from "@/lib/comms";
import { getActiveVoice } from "@/lib/voice";
import { getOrgSettings } from "@/lib/org";
import { writeRateLimit, distributedRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";
import { hasOptedOut, recordingDisclosure, callConsentRequired, hasCallConsent } from "@/lib/agent/guardrails";
import { enforcementOn } from "@/lib/billing/enforce";
import { isWithinVoiceMinutes } from "@/lib/billing/voice-minutes";
import { voicemailScript } from "@/lib/voice/voicemail";
import type { Activity } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

const Body = z.object({ dealId: z.string().optional(), contactId: z.string().optional(), to: z.string().optional() });

/** Idempotency window for placing a call (ms). A fast duplicate within this
 *  window is collapsed into one dial; a deliberate redial after it goes through.
 *  Tune with CALL_DEDUP_WINDOW_MS (default 15s). */
function callDedupWindowMs(): number {
  const n = Number(process.env.CALL_DEDUP_WINDOW_MS);
  return Number.isFinite(n) && n > 0 ? n : 15_000;
}

export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "call").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const provider = (await resolveProvider());
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

  // Strict consent mode (opt-in via CALL_REQUIRE_CONSENT): even a manual AI call
  // requires a recorded per-contact consent marker. Off by default — the power
  // dialer normally relies on rep judgment — so this only blocks when an operator
  // has chosen the strictest posture.
  if (callConsentRequired() && !hasCallConsent(contact ?? undefined)) {
    return NextResponse.json(
      { error: "Strict consent mode is on: record call consent on this contact before placing an AI call." },
      { status: 403 },
    );
  }

  // Voice-minutes allowance: every connected minute has real COGS (telephony +
  // STT + premium voice + the model), so when billing enforcement is on, calls
  // gate on the plan's included minutes. Open demos / self-hosted stay unmetered.
  if (enforcementOn() && !(await isWithinVoiceMinutes())) {
    return NextResponse.json(
      { error: "You're out of talk minutes for this month. Grab a minute top-up in Settings → Billing to keep dialing right now — email, SMS, and practice calls keep working either way." },
      { status: 402 },
    );
  }

  // Brief the in-house agent so it talks like it knows the prospect. Best-effort:
  // This org's settings, fetched once: caller-ID + org id for the gateway echo
  // below, and the industry that grounds the voicemail's call-back hook.
  const org = await getOrgSettings().catch(() => null);

  // Idempotency: collapse a double-submit / network retry into ONE real dial. The
  // unit is the destination number per org — you can't place two simultaneous
  // calls to the same line anyway, and a fast duplicate would otherwise be a
  // second BILLABLE call (telephony + STT + premium voice + the model). Short
  // window, so a deliberate redial a bit later still goes through. Cross-instance
  // (Supabase-backed) so it holds across serverless instances; fails OPEN if the
  // limiter's store hiccups (never block a legitimate call over a limiter blip).
  if (!(await distributedRateLimit(`dial:${org?.id ?? "_"}:${to}`, 1, callDedupWindowMs())).ok) {
    return NextResponse.json({ ok: true, deduped: true, to }, { status: 200 });
  }

  // never let context-building block the call.
  let context: string | undefined;
  let opener: string | undefined;
  let voicemail: string | undefined;
  try {
    const voice = await getActiveVoice();
    const rep = voice.senderName?.trim();
    const first = (contact?.name ?? "").trim().split(/\s+/)[0] || "there";
    const bits: string[] = [];
    if (contact?.name) bits.push(`You're calling ${oneLineUntrusted(contact.name)}${contact.company ? ` at ${oneLineUntrusted(contact.company)}` : ""}.`);
    if (opp?.title) bits.push(`It's about "${oneLineUntrusted(opp.title, 200)}"${opp.value ? ` — worth ${opp.currency ?? ""}${opp.value.toLocaleString()}` : ""}.`);
    if (opp?.lossReason) bits.push("This deal went cold / was marked lost — you're re-engaging warmly, no guilt-trip.");
    if (voice.business) bits.push(`Your business: ${voice.business}`);
    if (rep) bits.push(`You are ${rep}.`);
    // Memory: brief the agent with the recent relationship history (most recent
    // last) so it speaks like it remembers prior touches, not from a blank slate.
    const recent = activities
      .slice(-5)
      .map((a) => {
        const when = a.occurredAt ? new Date(a.occurredAt).toISOString().slice(0, 10) : "";
        // Prospect replies are logged verbatim into summaries — treat as data,
        // never as instructions the voice agent might obey on the next call.
        const text = oneLineUntrusted(a.summary, 140);
        return text ? `${when ? when + " " : ""}${a.direction ?? "out"} ${a.kind}: ${text}` : "";
      })
      .filter(Boolean);
    if (recent.length) bits.push(`Recent history with them (remember this, don't repeat yourself): ${recent.join(" | ")}.`);
    // Gap-aware open: if it's been a real while since the last touch, the agent
    // acknowledges it warmly instead of a cold-open (much better on a recall call).
    const lastTouch = activities.reduce<string | undefined>((latest, a) => (a.occurredAt && (!latest || a.occurredAt > latest) ? a.occurredAt : latest), undefined);
    const gapDays = lastTouch ? Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86_400_000) : 0;
    if (gapDays >= 21) bits.push(`It's been about ${gapDays} days since the last touch — warmly own the gap ("it's been a while"), no guilt-trip.`);
    bits.push("Goal: land one real next step — a meeting or a clear yes.");
    context = bits.join(" ");
    opener =
      gapDays >= 21
        ? rep
          ? `Hey ${first}, it's ${rep} — been a while, I know. Caught you at an okay time?`
          : `Hey ${first} — been a while! Got a quick sec?`
        : rep
          ? `Hey ${first}, it's ${rep} — caught you at an okay time?`
          : `Hey ${first} — caught you at an okay time?`;
    // A personalized voicemail to leave if the call hits a machine — gap-aware,
    // so a long-dormant deal gets a warm "it's been a while" message. Most recall
    // calls reach voicemail; a good one left here is often what restarts the deal.
    voicemail = voicemailScript({
      contactName: contact?.name,
      repName: rep,
      dealTitle: opp?.title,
      daysSinceContact: gapDays,
      industryId: org?.industryId,
      seed: parsed.data.dealId || contactId || to,
    });
  } catch {
    /* context is a nicety; place the call regardless */
  }

  // Recording disclosure (two-party-consent jurisdictions) is spoken first, even
  // if context-building above failed.
  const disclosure = recordingDisclosure();
  if (disclosure) opener = opener ? `${disclosure} ${opener}` : disclosure;

  // Caller-ID + org id are echoed by the gateway back to /api/calls/log so the
  // call dials from the right number AND the transcript lands on the right
  // tenant's timeline (not the first org).
  const from = org?.callerId;

  // Tag the call so the gateway can echo it back to /api/calls/log and the
  // transcript attaches to the right record (and the right org).
  const meta: Record<string, string> = {};
  if (contactId) meta.contactId = contactId;
  if (parsed.data.dealId) meta.dealId = parsed.data.dealId;
  if (org?.id) meta.orgId = org.id;

  // Sign the meta so the gateway's post-back can't be replayed onto another
  // tenant (verified in /api/calls/log before any org-scoped write).
  const result = await placeCall(to, { from, voiceId: org?.voiceId, context, opener, voicemail, meta: Object.keys(meta).length ? signCallMeta(meta) : undefined });
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
