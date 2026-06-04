import { NextResponse } from "next/server";
import { z } from "zod";
import { setContactStatus } from "@/lib/leads";
import { LEAD_STATUSES } from "@/lib/crm/lead-status";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const Body = z.object({
  ids: z.array(z.string().min(1).max(200)).min(1).max(500),
  status: z.enum(LEAD_STATUSES),
});

/** Bulk-set lead status for many contacts at once (org-scoped via the provider).
 *  Per-id failures are skipped so one bad id doesn't fail the whole batch. */
export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "contacts-bulk").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  let updated = 0;
  for (const id of parsed.data.ids) {
    try {
      if (await setContactStatus(id, parsed.data.status)) updated += 1;
    } catch {
      /* skip a failed id; report how many actually updated */
    }
  }
  return NextResponse.json({ ok: true, updated });
});
