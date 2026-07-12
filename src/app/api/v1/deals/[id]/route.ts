import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { withApiKey } from "@/lib/api/auth";
import { getDealDetail } from "@/lib/queries";
import { moveDeal } from "@/lib/deals";

export const dynamic = "force-dynamic";

/**
 * Public API — PATCH /api/v1/deals/:id. Move a deal's stage (two-way sync). Pass
 * an explicit `stageId`, or `status: "won" | "lost"` to advance it to that
 * outcome stage in its own pipeline. Emits the matching webhook via moveDeal.
 */
const Body = z
  .object({
    stageId: z.string().trim().min(1).optional(),
    status: z.enum(["won", "lost"]).optional(),
  })
  .refine((d) => Boolean(d.stageId || d.status), { message: "stageId or status is required" });

export const PATCH = withGuard(
  withApiKey<{ params: Promise<{ id: string }> }>(async (req, _orgId, { params }) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }

    const detail = await getDealDetail((await params).id);
    if (!detail) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    let stageId = parsed.data.stageId;
    if (!stageId && parsed.data.status) {
      stageId = detail.pipeline.stages.find((s) => s.type === parsed.data.status)?.id;
    }
    // A provided stageId must belong to this deal's pipeline.
    const target = stageId ? detail.pipeline.stages.find((s) => s.id === stageId) : undefined;
    if (!stageId || !target) {
      return NextResponse.json({ error: "No matching stage in this deal's pipeline" }, { status: 400 });
    }

    const opp = await moveDeal((await params).id, stageId);
    return NextResponse.json({
      ok: true,
      deal: { id: opp.id, title: opp.title, value: opp.value, currency: opp.currency, stage: target.label },
    });
  }),
);
