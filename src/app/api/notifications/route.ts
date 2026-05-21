import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { buildRecallQueue } from "@/lib/recall/engine";

export const dynamic = "force-dynamic";

/** Notifications derived from the recall engine — the deals needing attention. */
export async function GET() {
  const provider = getProvider();
  const [pipelines, opps] = await Promise.all([provider.listPipelines(), provider.listOpportunities()]);
  const items = buildRecallQueue(opps, pipelines).slice(0, 8);
  return NextResponse.json({
    count: items.length,
    items: items.map((r) => ({
      id: r.opportunityId,
      title: r.title,
      reason: r.reason,
      score: r.score,
      recommendation: r.recommendation,
    })),
  });
}
