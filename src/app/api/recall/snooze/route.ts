import { NextResponse } from "next/server";
import { z } from "zod";
import { snoozeDeal, unsnoozeDeal } from "@/lib/recall/snooze";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const Body = z.object({
  opportunityId: z.string().min(1),
  days: z.number().int().positive().max(90).optional(),
});

/** Snooze a deal in the recall queue (default 7 days). Session-gated by middleware;
 *  org-scoped in snoozeDeal. */
export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "recall-snooze").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await snoozeDeal(parsed.data.opportunityId, parsed.data.days ?? 7);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't snooze" }, { status: 409 });
  }
});

/** Un-snooze a deal (?opportunityId=…) — bring it back to the queue now. */
export const DELETE = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "recall-snooze").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const id = new URL(req.url).searchParams.get("opportunityId");
  if (!id) return NextResponse.json({ error: "Missing opportunityId" }, { status: 400 });
  try {
    await unsnoozeDeal(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't un-snooze" }, { status: 409 });
  }
});
