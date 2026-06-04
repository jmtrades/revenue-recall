import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { withApiKey, readLimit } from "@/lib/api/auth";
import { getProvider } from "@/lib/crm/registry";
import { createDealRecord } from "@/lib/deals";

export const dynamic = "force-dynamic";

const Body = z.object({
  contactId: z.string().trim().min(1),
  title: z.string().trim().max(200).optional(),
  value: z.number().nonnegative().max(1e12).optional(),
  currency: z.string().trim().length(3).optional(),
  source: z.string().trim().max(80).optional(),
  stageId: z.string().trim().min(1).optional(),
});

/** Create an open deal for an existing contact. */
export const POST = withGuard(
  withApiKey(async (req: Request) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    const result = await createDealRecord(parsed.data);
    if (!result.ok) {
      return result.reason === "contact_not_found"
        ? NextResponse.json({ error: "Contact not found" }, { status: 404 })
        : NextResponse.json({ error: "No matching stage in the pipeline" }, { status: 400 });
    }
    const o = result.opp;
    return NextResponse.json(
      { ok: true, deal: { id: o.id, title: o.title, value: o.value, currency: o.currency, stage: result.stageLabel, contactId: o.contactId } },
      { status: 201 },
    );
  }),
);

/**
 * Public API — GET /api/v1/deals. Lists the org's opportunities in a clean,
 * stable v1 shape (stage resolved to its label). Authenticated by the workspace
 * API key; org-scoped via lib/api/auth. Lets a customer sync pipeline data out.
 */
export const GET = withGuard(
  withApiKey(async (req: Request) => {
    const provider = getProvider();
    const [opps, pipelines] = await Promise.all([provider.listOpportunities(), provider.listPipelines()]);
    const stageById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s.label]));
    const limit = readLimit(req);
    const data = opps.slice(0, limit).map((o) => ({
      id: o.id,
      title: o.title,
      value: o.value,
      currency: o.currency,
      stage: stageById.get(o.stageId) ?? null,
      contactId: o.contactId,
      source: o.source ?? null,
      createdAt: o.createdAt,
      expectedCloseAt: o.expectedCloseAt ?? null,
    }));
    return NextResponse.json({ data, count: data.length, total: opps.length });
  }),
);
