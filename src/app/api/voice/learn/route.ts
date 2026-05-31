import { NextResponse } from "next/server";
import { z } from "zod";
import { learnVoice } from "@/lib/voice";
import { aiRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  senderName: z.string().max(120).optional(),
  role: z.string().max(160).optional(),
  signature: z.string().max(200).optional(),
  samples: z.string().max(8000).optional(),
  business: z.string().max(4000).optional(),
  customNextSteps: z.string().max(4000).optional(),
  customReengage: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  if (!aiRateLimit(req, "voice-learn").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a description or a writing sample first." }, { status: 400 });
  const { senderName, role, signature, samples, business, customNextSteps, customReengage } = parsed.data;
  // Accept anything worth saving — name/role/signature are useful on their own
  // (they shape sign-offs), even before a writing sample is added. Only reject a
  // wholly empty request.
  const hasSomething = [senderName, role, signature, samples, business, customNextSteps, customReengage].some((v) => v?.trim());
  if (!hasSomething) {
    return NextResponse.json({ error: "Add your name, a writing sample, or some go-to lines first." }, { status: 400 });
  }
  try {
    const voice = await learnVoice(parsed.data);
    return NextResponse.json(voice);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
