import { NextResponse } from "next/server";
import { z } from "zod";
import { logCallOutcome } from "@/lib/calls";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { safeEqual } from "@/lib/safe-compare";
import { runWithOrg } from "@/lib/supabase/org-context";

export const dynamic = "force-dynamic";

// Phone-ish: digits with the usual separators; rejects script/markup payloads.
const PHONE = /^[+]?[0-9][0-9\s().\-]{5,38}$/;

const Body = z.object({
  to: z.string().max(40).regex(PHONE).optional(),
  contactId: z.string().max(200).optional(),
  dealId: z.string().max(200).optional(),
  // The gateway echoes the per-call meta it received from /api/calls/place —
  // including the owning org id, so the transcript lands on the RIGHT tenant's
  // timeline instead of falling back to the first org.
  meta: z.object({ contactId: z.string().optional(), dealId: z.string().optional(), orgId: z.string().max(200).optional() }).partial().optional(),
  outcome: z.string().max(80).optional(),
  transcript: z.string().max(20000).optional(),
  durationSec: z.number().nonnegative().optional(),
  recordingUrl: z.string().url().max(2000).optional(),
});

/** Bearer check against the shared COMMS_WEBHOOK_TOKEN (same secret the gateway
 *  is given), constant-time. When no token is configured we accept the post
 *  (dev/log-only), mirroring the other inbound webhooks. */
function authorized(req: Request): boolean {
  const token = process.env.COMMS_WEBHOOK_TOKEN;
  if (!token) return true;
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${token}`);
}

/**
 * Inbound webhook the in-house call-gateway POSTs to after each call so the
 * transcript + outcome land on the CRM timeline (closing the loop the gateway
 * couldn't on its own).
 */
export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, "calls-log"), 120, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const b = parsed.data;
  const log = () =>
    logCallOutcome({
      to: b.to,
      contactId: b.contactId ?? b.meta?.contactId,
      dealId: b.dealId ?? b.meta?.dealId,
      outcome: b.outcome,
      transcript: b.transcript,
      durationSec: b.durationSec,
      recordingUrl: b.recordingUrl,
    });
  // Scope the write to the org that placed the call (the webhook has no session,
  // so without this it would fall back to the first org — a cross-tenant leak).
  const orgId = b.meta?.orgId;
  const activity = orgId ? await runWithOrg(orgId, log) : await log();
  return NextResponse.json({ ok: true, logged: Boolean(activity), id: activity?.id });
}
