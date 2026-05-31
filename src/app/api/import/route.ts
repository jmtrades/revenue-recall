import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { toLanguageCode } from "@/lib/languages";
import { dedupeRows } from "@/lib/import/dedupe";
import { mapWithConcurrency } from "@/lib/async";
import type { Contact, ContactPoint, Stage } from "@/lib/crm/types";

export const dynamic = "force-dynamic";

// How many lead rows to create in parallel. Tunable for backends with tighter
// write limits; high enough to clear a few thousand rows well within budget.
const IMPORT_CONCURRENCY = Number(process.env.IMPORT_CONCURRENCY ?? 8) || 8;

const Row = z.object({
  name: z.string().min(1).max(200),
  email: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  company: z.string().max(200).optional(),
  value: z.number().nonnegative().max(1_000_000_000).optional(),
  stage: z.string().max(120).optional(),
  language: z.string().max(40).optional(),
});

const Body = z.object({ rows: z.array(Row).min(1).max(2000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });

  const provider = getProvider();
  if (!provider.info().capabilities.write) {
    return NextResponse.json({ error: "The active CRM is read-only; import is unavailable." }, { status: 409 });
  }

  let pipelineId: string;
  let stages: Stage[];
  try {
    const pipelines = await provider.listPipelines();
    const pipeline = pipelines[0];
    if (!pipeline) throw new Error("no pipeline");
    pipelineId = pipeline.id;
    stages = pipeline.stages;
  } catch {
    return NextResponse.json({ error: "No pipeline available for import." }, { status: 409 });
  }

  const matchStage = (label?: string): Stage | undefined => {
    if (!label) return undefined;
    const l = label.toLowerCase();
    return stages.find((s) => s.label.toLowerCase() === l) ?? stages.find((s) => s.label.toLowerCase().includes(l));
  };

  // Skip leads we already have (matched by email/phone) so a re-import — or a
  // messy list with repeats — never double-creates a contact and the rep never
  // calls the same person twice. Best-effort: if existing contacts can't be
  // read, we still dedupe within the submitted batch.
  const existing = await provider.listContacts().catch(() => [] as Contact[]);
  const { toCreate, existingDuplicates, batchDuplicates } = dedupeRows(parsed.data.rows, existing);

  // Price new opportunities in the org's currency rather than a hardcoded USD.
  const currency = (await getOrgSettings().catch(() => null))?.currency ?? "USD";

  let created = 0;
  let dealsCreated = 0;
  const errors: string[] = [];

  // Create rows with bounded parallelism. A large list done strictly serially
  // can exceed the serverless time budget; firing all at once stampedes the DB.
  // Each task creates the contact and (when priced) its opportunity together, so
  // the opp always has a valid contact id.
  const settled = await mapWithConcurrency(toCreate, IMPORT_CONCURRENCY, async (r) => {
    const points: ContactPoint[] = [];
    if (r.email) points.push({ channel: "email", value: r.email });
    if (r.phone) points.push({ channel: "phone", value: r.phone });
    const contact = await provider.createContact({
      name: r.name,
      company: r.company,
      points,
      attributes: r.language ? { preferredLanguage: toLanguageCode(r.language) ?? r.language } : undefined,
    });
    let deal = false;
    if (r.value !== undefined || r.stage) {
      const stageId = matchStage(r.stage)?.id ?? stages[0]?.id;
      await provider.createOpportunity({
        title: `${r.company ?? r.name} — opportunity`,
        contactId: contact.id,
        pipelineId,
        stageId,
        value: r.value ?? 0,
        currency,
        source: "CSV import",
      });
      deal = true;
    }
    return deal;
  });

  settled.forEach((res, i) => {
    if (res.ok) {
      created++;
      if (res.value) dealsCreated++;
    } else {
      errors.push(`${toCreate[i].name}: ${res.error instanceof Error ? res.error.message : "failed"}`);
    }
  });

  return NextResponse.json({
    contacts: created,
    deals: dealsCreated,
    duplicates: existingDuplicates + batchDuplicates,
    existingDuplicates,
    batchDuplicates,
    errors: errors.slice(0, 20),
    errorCount: errors.length,
  });
}
