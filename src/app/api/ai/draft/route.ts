import { NextResponse } from "next/server";
import { z } from "zod";
import { getDealDetail } from "@/lib/queries";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";
import { draftMessage, draftVariations, type DraftInput } from "@/lib/ai/draft";
import { getActiveVoice } from "@/lib/voice";
import { isToneId } from "@/lib/tones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  dealId: z.string().min(1),
  channel: z.enum(["email", "sms", "call"]),
  tone: z.string().optional(),
  /** When > 1, return that many distinct alternatives instead of one draft. */
  variations: z.number().int().min(1).max(5).optional(),
});

function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dealId and channel required" }, { status: 400 });

  const detail = await getDealDetail(parsed.data.dealId);
  if (!detail) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const industry = getIndustry(getConfig().industryId);
  const voice = await getActiveVoice();
  const input: DraftInput = {
    voice,
    channel: parsed.data.channel,
    tone: isToneId(parsed.data.tone) ? parsed.data.tone : undefined,
    contactName: detail.contact?.name ?? detail.opp.title,
    company: detail.contact?.company,
    dealTitle: detail.opp.title,
    valueLabel: industry.terminology.value,
    value: detail.opp.value,
    currency: detail.opp.currency,
    stageLabel: detail.stage?.label ?? "open",
    industryLabel: industry.label,
    industryId: industry.id,
    recallReason: detail.opp.lossReason ? "lost_winnable" : undefined,
    daysSinceContact: daysSince(detail.opp.lastActivityAt),
    history: detail.activities.map((a) => `${a.kind}: ${a.summary}`),
    repName: detail.owner?.name === "You" ? "" : detail.owner?.name,
  };

  const count = parsed.data.variations ?? 1;
  if (count > 1) {
    const variations = await draftVariations(input, count);
    return NextResponse.json({ variations });
  }
  return NextResponse.json(await draftMessage(input));
}
