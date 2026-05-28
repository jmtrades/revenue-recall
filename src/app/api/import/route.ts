import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/crm/registry";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Row = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  value: z.string().max(30).optional(),
});
const Body = z.object({ rows: z.array(Row).min(1).max(1000) });

function parseValue(v?: string): number {
  if (!v) return 0;
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Bulk-create contacts (and optional deals) from a parsed CSV, through the
 *  active CRM provider. A numeric `value` column creates an open deal for the
 *  contact in the default pipeline. */
export async function POST(req: Request) {
  const rl = limited(req, "import", 5, 60_000);
  if (rl) return rl;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide up to 1000 rows, each with at least a name." }, { status: 400 });
  }

  const provider = getProvider();
  const currency = getIndustry(getConfig().industryId).currency;

  // Resolve a default pipeline + first open stage once, for deal creation.
  let pipelineId: string | undefined;
  let stageId: string | undefined;
  try {
    const pipelines = await provider.listPipelines();
    const pipeline = pipelines[0];
    const stage = pipeline?.stages.find((s) => s.type === "open") ?? pipeline?.stages[0];
    pipelineId = pipeline?.id;
    stageId = stage?.id;
  } catch {
    /* deals just won't be created if we can't resolve a pipeline */
  }

  let contacts = 0;
  let deals = 0;
  let skipped = 0;
  const errors: string[] = [];
  const seenEmails = new Set<string>();

  for (const r of parsed.data.rows) {
    // Skip obvious in-batch duplicates so a re-uploaded file doesn't double up.
    const emailKey = r.email?.trim().toLowerCase();
    if (emailKey) {
      if (seenEmails.has(emailKey)) {
        skipped += 1;
        continue;
      }
      seenEmails.add(emailKey);
    }
    const points = [
      ...(r.email ? [{ channel: "email" as const, value: r.email }] : []),
      ...(r.phone ? [{ channel: "phone" as const, value: r.phone }] : []),
    ];
    try {
      const contact = await provider.createContact({ name: r.name, company: r.company, title: r.title, points, attributes: {} });
      contacts += 1;

      const value = parseValue(r.value);
      if (value > 0 && pipelineId && stageId) {
        try {
          await provider.createOpportunity({
            title: r.company ? `${r.company} — ${r.name}` : r.name,
            pipelineId,
            stageId,
            value,
            currency,
            contactId: contact.id,
          });
          deals += 1;
        } catch {
          /* contact still imported; skip the deal */
        }
      }
    } catch (e) {
      errors.push(`${r.name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return NextResponse.json({ created: contacts, deals, skipped, failed: errors.length, errors: errors.slice(0, 10) });
}
