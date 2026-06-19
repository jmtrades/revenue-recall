import { NextResponse } from "next/server";
import { z } from "zod";
import { logCallOutcome, scheduleCallRetry, scheduleVoicemailFollowup, scheduleRequestedCallback } from "@/lib/calls";
import { parseCallbackTime, callbackLabel } from "@/lib/calls/callback-time";
import { timezoneForPhone } from "@/lib/calls/local-time";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { safeEqual } from "@/lib/safe-compare";
import { verifyCallMeta } from "@/lib/calls/meta-sig";
import { runWithOrg } from "@/lib/supabase/org-context";
import { seenInboundEvent, forgetInboundEvent } from "@/lib/inbound-dedup";
import { resolveProvider } from "@/lib/crm/registry";
import { markDoNotContact } from "@/lib/opt-out";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

// Phone-ish: digits with the usual separators; rejects script/markup payloads.
const PHONE = /^[+]?[0-9][0-9\s().\-]{5,38}$/;

const Body = z.object({
  // Stable per-call id from the gateway — makes logging idempotent so a retried
  // post-back (succeeded-but-timed-out) doesn't double-log the call.
  callId: z.string().max(80).optional(),
  to: z.string().max(40).regex(PHONE).optional(),
  contactId: z.string().max(200).optional(),
  dealId: z.string().max(200).optional(),
  // The gateway echoes the per-call meta it received from /api/calls/place —
  // including the owning org id, so the transcript lands on the RIGHT tenant's
  // timeline instead of falling back to the first org.
  meta: z.object({ contactId: z.string().optional(), dealId: z.string().optional(), orgId: z.string().max(200).optional(), sig: z.string().max(64).optional() }).partial().optional(),
  outcome: z.string().max(80).optional(),
  transcript: z.string().max(20000).optional(),
  durationSec: z.number().nonnegative().optional(),
  recordingUrl: z.string().url().max(2000).optional(),
  // The prospect asked to stop being contacted DURING the call — persist a
  // durable do-not-contact so the agent never dials/messages them again.
  optOut: z.boolean().optional(),
});

/** Bearer check against the shared COMMS_WEBHOOK_TOKEN (same secret the gateway
 *  is given), constant-time. With no token configured we accept only outside
 *  production; in prod we fail closed — an open endpoint lets anyone forge a
 *  transcript onto a tenant's timeline (the body carries meta.orgId). */
function authorized(req: Request): boolean {
  const token = process.env.COMMS_WEBHOOK_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${token}`);
}

/**
 * Inbound webhook the in-house call-gateway POSTs to after each call so the
 * transcript + outcome land on the CRM timeline (closing the loop the gateway
 * couldn't on its own).
 */
export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "calls-log"), 120, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const b = parsed.data;
  // Idempotency: a retried post-back with the same callId no-ops (no double log).
  if (b.callId && (await seenInboundEvent("call", b.callId))) {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  // An org-addressed post-back must carry the HMAC this server attached at
  // place-time — the shared gateway token alone must not be able to write onto
  // an arbitrary tenant's timeline.
  if (b.meta?.orgId && !verifyCallMeta(b.meta)) {
    return NextResponse.json({ error: "Invalid meta signature" }, { status: 401 });
  }
  const contactId = b.contactId ?? b.meta?.contactId;
  const dealId = b.dealId ?? b.meta?.dealId;
  const log = async () => {
    const activity = await logCallOutcome({
      to: b.to,
      contactId,
      dealId,
      outcome: b.outcome,
      transcript: b.transcript,
      durationSec: b.durationSec,
      recordingUrl: b.recordingUrl,
    });
    // If the PROSPECT named a callback time ON the call ("call me Thursday at
    // 10"), book that exact dial in THEIR timezone — the highest-intent follow-up.
    // Parse only their lines so a rep-proposed time can't trigger it. Falls back
    // to the generic no-answer retry only when no time was agreed. Best-effort.
    if (activity) {
      const tz = b.to ? timezoneForPhone(b.to) ?? undefined : undefined;
      const prospectText = (b.transcript ?? "")
        .split("\n")
        .filter((l) => /^\s*prospect:/i.test(l))
        .join("\n");
      const when = prospectText ? parseCallbackTime(prospectText, new Date(), tz) : null;
      if (when) await scheduleRequestedCallback({ contactId, dealId, when, label: callbackLabel(when, tz) });
      else await scheduleCallRetry({ contactId, dealId, outcome: b.outcome });
    }
    // If it hit voicemail, queue a short follow-up text to Approvals (best-effort,
    // non-throwing, opt-out-aware) so they have an easy async reply path.
    if (activity) await scheduleVoicemailFollowup({ contactId, dealId, outcome: b.outcome });
    // A verbal opt-out on the call → durable do-not-contact, so future outreach
    // (calls, texts, email) is suppressed for this contact. Best-effort: the
    // logged call already records the request even if the flag write can't land.
    if (b.optOut && contactId) {
      try {
        const provider = await resolveProvider();
        const contact = await provider.getContact(contactId);
        if (contact) await markDoNotContact(provider, contact);
      } catch {
        /* best-effort — never fail the call-log post-back on a suppression write */
      }
    }
    return activity;
  };
  // Scope the write to the org that placed the call (the webhook has no session,
  // so without this it would fall back to the first org — a cross-tenant leak).
  const orgId = b.meta?.orgId;
  try {
    const activity = orgId ? await runWithOrg(orgId, log) : await log();
    return NextResponse.json({ ok: true, logged: Boolean(activity), id: activity?.id });
  } catch (e) {
    // Un-record the dedup key so the gateway's retry can reprocess (don't lose
    // the transcript to a dedup after a transient failure).
    if (b.callId) await forgetInboundEvent("call", b.callId);
    throw e;
  }
});
