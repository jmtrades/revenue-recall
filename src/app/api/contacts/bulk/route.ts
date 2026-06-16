import { NextResponse } from "next/server";
import { z } from "zod";
import { setContactStatus } from "@/lib/leads";
import { setContactConsent } from "@/lib/contacts";
import { recordAudit } from "@/lib/audit";
import { LEAD_STATUSES } from "@/lib/crm/lead-status";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const Ids = z.array(z.string().min(1).max(200)).min(1).max(500);
const StatusBody = z.object({ ids: Ids, status: z.enum(LEAD_STATUSES) });
const ConsentBody = z.object({ ids: Ids, consent: z.boolean() });

/** Bulk-apply an action across many contacts at once (org-scoped via the
 *  provider): set lead status, OR record/withdraw call consent so autonomous
 *  dialing can be switched on/off for a whole list. Per-id failures are skipped
 *  so one bad id doesn't fail the batch; the count reflects what actually changed. */
export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "contacts-bulk").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const raw = await req.json().catch(() => null);

  // Bulk consent — record/withdraw across a whole selection (audited per id).
  const asConsent = ConsentBody.safeParse(raw);
  if (asConsent.success) {
    let updated = 0;
    for (const id of asConsent.data.ids) {
      try {
        if (await setContactConsent(id, asConsent.data.consent)) {
          updated += 1;
          await recordAudit(asConsent.data.consent ? "contact.consent.granted" : "contact.consent.revoked", id);
        }
      } catch {
        /* skip a failed id; report how many actually updated */
      }
    }
    return NextResponse.json({ ok: true, updated });
  }

  const asStatus = StatusBody.safeParse(raw);
  if (!asStatus.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  let updated = 0;
  for (const id of asStatus.data.ids) {
    try {
      if (await setContactStatus(id, asStatus.data.status)) updated += 1;
    } catch {
      /* skip a failed id; report how many actually updated */
    }
  }
  return NextResponse.json({ ok: true, updated });
});
