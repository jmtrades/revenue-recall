import { NextResponse } from "next/server";
import { moveDeal } from "@/lib/deals";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";
import { z } from "zod";

const Body = z.object({ stageId: z.string().min(1) });

export const POST = withGuard<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  if (!writeRateLimit(req, "deal-move").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "stageId is required" }, { status: 400 });
  }
  try {
    const opp = await moveDeal((await params).id, parsed.data.stageId);
    return NextResponse.json({ opportunity: opp });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "move failed" }, { status: 409 });
  }
});
