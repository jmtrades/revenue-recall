import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";
import { getActiveVoice } from "@/lib/voice";
import { isToneId } from "@/lib/tones";
import { runCall, type ConversationState, type Difficulty } from "@/lib/voice/conversation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  contactName: z.string().min(1),
  company: z.string().optional(),
  dealTitle: z.string().min(1),
  tone: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  maxRepTurns: z.number().int().min(2).max(30).optional(),
});

/** Run a complete simulated call end to end and return the transcript + scorecard. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const industry = getIndustry(getConfig().industryId);
  const voice = await getActiveVoice();
  const state: ConversationState = {
    contactName: parsed.data.contactName,
    company: parsed.data.company,
    dealTitle: parsed.data.dealTitle,
    industryId: industry.id,
    industryLabel: industry.label,
    tone: isToneId(parsed.data.tone) ? parsed.data.tone : undefined,
    voice: { senderName: voice.senderName, profile: voice.profile, customNextSteps: voice.customNextSteps },
    turns: [],
  };

  const result = await runCall(state, { difficulty: (parsed.data.difficulty ?? "medium") as Difficulty, maxRepTurns: parsed.data.maxRepTurns });
  return NextResponse.json(result);
}
