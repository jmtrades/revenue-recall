import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { withApiKey, readLimit } from "@/lib/api/auth";
import { getProvider } from "@/lib/crm/registry";

export const dynamic = "force-dynamic";

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
