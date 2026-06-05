import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { z } from "zod";
import { getDealDetail } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { getActiveVoice } from "@/lib/voice";
import { getIndustry } from "@/lib/industries";
import { summarizeDeal } from "@/lib/ai/brief";
import { voicemailScript } from "@/lib/voice/voicemail";
import { aiRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ dealId: z.string().min(1) });

function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export const POST = withGuard(async (req: Request) => {
  if (!aiRateLimit(req, "ai-brief").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dealId required" }, { status: 400 });

  const detail = await getDealDetail(parsed.data.dealId);
  if (!detail) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const org = await getOrgSettings();
  const industry = getIndustry(org.industryId);
  const gapDays = daysSince(detail.opp.lastActivityAt);
  const result = await summarizeDeal({
    contactName: detail.contact?.name ?? detail.opp.title,
    company: detail.contact?.company,
    dealTitle: detail.opp.title,
    valueLabel: industry.terminology.value,
    value: detail.opp.value,
    currency: detail.opp.currency,
    stageLabel: detail.stage?.label ?? "open",
    stageType: detail.stage?.type ?? "open",
    industryLabel: industry.label,
    daysSinceContact: gapDays,
    history: detail.activities.map((a) => `${a.kind}: ${a.summary}`),
    language: org.language,
  });

  // A ready voicemail to leave if they don't pick up — same gap-aware script the
  // autonomous dialer sends to the gateway, so the rep and the AI say the same thing.
  const voice = await getActiveVoice().catch(() => ({ senderName: undefined }));
  const voicemail = voicemailScript({
    contactName: detail.contact?.name,
    repName: voice.senderName,
    dealTitle: detail.opp.title,
    daysSinceContact: gapDays,
    seed: detail.opp.id,
  });

  return NextResponse.json({ ...result, voicemail });
});
