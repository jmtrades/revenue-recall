import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";
import { z } from "zod";

const Body = z.object({
  title: z.string().min(1).max(200),
  contactId: z.string().min(1),
  value: z.number().nonnegative(),
  stageId: z.string().min(1),
  ownerId: z.string().optional(),
  source: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid deal" }, { status: 400 });

  const provider = getProvider();
  const pipelines = await provider.listPipelines();
  const pipeline = pipelines[0];
  if (!pipeline) return NextResponse.json({ error: "No pipeline" }, { status: 409 });
  if (!pipeline.stages.some((s) => s.id === parsed.data.stageId)) {
    return NextResponse.json({ error: "Unknown stage" }, { status: 400 });
  }

  try {
    const opp = await provider.createOpportunity({
      ...parsed.data,
      pipelineId: pipeline.id,
      currency: getIndustry(getConfig().industryId).currency,
    });
    return NextResponse.json({ opportunity: opp }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 409 });
  }
}
