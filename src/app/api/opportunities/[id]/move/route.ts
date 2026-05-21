import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { z } from "zod";

const Body = z.object({ stageId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "stageId is required" }, { status: 400 });
  }
  try {
    const opp = await getProvider().moveOpportunity(params.id, parsed.data.stageId);
    return NextResponse.json({ opportunity: opp });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "move failed" }, { status: 409 });
  }
}
