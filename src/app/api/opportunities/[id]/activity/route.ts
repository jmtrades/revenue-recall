import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/crm/registry";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";
import { z } from "zod";

const Body = z.object({
  kind: z.enum(["call", "email", "sms", "meeting", "note", "task"]),
  summary: z.string().min(1).max(2000),
  direction: z.enum(["inbound", "outbound"]).optional(),
});

export const POST = withGuard<{ params: { id: string } }>(async (req, { params }) => {
  if (!writeRateLimit(req, "deal-activity").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid activity" }, { status: 400 });

  const provider = (await resolveProvider());
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
});
