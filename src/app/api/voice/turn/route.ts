import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { z } from "zod";
import { getOrgSettings } from "@/lib/org";
import { getIndustry } from "@/lib/industries";
import { getActiveVoice } from "@/lib/voice";
import { isToneId } from "@/lib/tones";
import { nextRepTurn, simulateProspect, type ConversationState, type Difficulty } from "@/lib/voice/conversation";
import { pickAck } from "@/lib/voice/turntaking";
import { aiRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TurnSchema = z.object({ speaker: z.enum(["rep", "prospect"]), text: z.string() });
const Body = z.object({
  who: z.enum(["rep", "prospect"]),
  contactName: z.string().min(1),
  company: z.string().optional(),
  dealTitle: z.string().min(1),
  tone: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  turns: z.array(TurnSchema).max(60),
});

export const POST = withGuard(async (req: Request) => {
  if (!(await aiRateLimit(req, "voice")).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const [org, voice] = await Promise.all([getOrgSettings(), getActiveVoice()]);
  const industry = getIndustry(org.industryId);
  const state: ConversationState = {
    contactName: parsed.data.contactName,
    company: parsed.data.company,
    dealTitle: parsed.data.dealTitle,
    industryId: industry.id,
    industryLabel: industry.label,
    tone: isToneId(parsed.data.tone) ? parsed.data.tone : undefined,
    language: org.language,
    voice: { senderName: voice.senderName, profile: voice.profile, customNextSteps: voice.customNextSteps },
    turns: parsed.data.turns,
  };

  if (parsed.data.who === "prospect") {
    const out = await simulateProspect(state, (parsed.data.difficulty ?? "medium") as Difficulty);
    return NextResponse.json(out);
  }
  const out = await nextRepTurn(state);
  // Dead-air killer for live calls: an instant, intent-aware acknowledgment
  // ("Yeah — fair question.") the gateway speaks the moment the caller stops
  // talking, while this turn's full reply is synthesized. Additive — clients
  // that ignore it lose nothing.
  const lastProspect = [...parsed.data.turns].reverse().find((t) => t.speaker === "prospect");
  const ack = lastProspect ? pickAck(lastProspect.text, `${parsed.data.dealTitle}:${parsed.data.turns.length}`, "rep") : null;
  return NextResponse.json({ ...out, ack });
});
