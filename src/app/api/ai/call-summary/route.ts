import { NextResponse } from "next/server";
import { z } from "zod";
import { getDealDetail } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { summarizeCall } from "@/lib/ai/callSummary";
import { aiRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ dealId: z.string().min(1), notes: z.string().max(8000) });

export async function POST(req: Request) {
  if (!aiRateLimit(req, "ai-callsummary").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dealId and notes required" }, { status: 400 });

  const detail = await getDealDetail(parsed.data.dealId);
  if (!detail) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const org = await getOrgSettings();
  const result = await summarizeCall({
    contactName: detail.contact?.name ?? detail.opp.title,
    dealTitle: detail.opp.title,
    notes: parsed.data.notes,
    language: org.language,
  });
  return NextResponse.json(result);
}
