import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { z } from "zod";

const Body = z.object({
  kind: z.enum(["call", "email", "sms", "meeting", "note", "task"]),
  summary: z.string().min(1).max(2000),
  direction: z.enum(["inbound", "outbound"]).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid activity" }, { status: 400 });

  const provider = getProvider();
  const opp = await provider.getOpportunity(params.id);
  if (!opp) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  try {
    const activity = await provider.logActivity({
      opportunityId: params.id,
      contactId: opp.contactId,
      kind: parsed.data.kind,
      summary: parsed.data.summary,
      direction: parsed.data.direction,
      occurredAt: new Date().toISOString(),
    });
    return NextResponse.json({ activity });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 409 });
  }
}
