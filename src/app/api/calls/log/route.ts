import { NextResponse } from "next/server";
import { z } from "zod";
import { logCallOutcome } from "@/lib/calls";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({
  to: z.string().max(40).optional(),
  contactId: z.string().max(200).optional(),
  dealId: z.string().max(200).optional(),
  // The gateway echoes the per-call meta it received from /api/calls/place.
  meta: z.object({ contactId: z.string().optional(), dealId: z.string().optional() }).partial().optional(),
  outcome: z.string().max(80).optional(),
  transcript: z.string().max(20000).optional(),
  durationSec: z.number().nonnegative().optional(),
  recordingUrl: z.string().max(2000).optional(),
});

/** Bearer check against the shared COMMS_WEBHOOK_TOKEN (same secret the gateway
 *  is given). When no token is configured we accept the post (dev/log-only),
 *  mirroring the other inbound webhooks. */
function authorized(req: Request): boolean {
  const token = process.env.COMMS_WEBHOOK_TOKEN;
  if (!token) return true;
  return req.headers.get("authorization") === `Bearer ${token}`;
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
  const activity = await logCallOutcome({
    to: b.to,
    contactId: b.contactId ?? b.meta?.contactId,
    dealId: b.dealId ?? b.meta?.dealId,
    outcome: b.outcome,
    transcript: b.transcript,
    durationSec: b.durationSec,
    recordingUrl: b.recordingUrl,
  });
  return NextResponse.json({ ok: true, logged: Boolean(activity), id: activity?.id });
}
