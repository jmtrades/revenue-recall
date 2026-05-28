import { NextResponse } from "next/server";
import { z } from "zod";
import { learnVoice } from "@/lib/voice";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  senderName: z.string().max(120).optional(),
  role: z.string().max(160).optional(),
  signature: z.string().max(200).optional(),
  samples: z.string().max(8000).optional(),
  customNextSteps: z.string().max(4000).optional(),
  customReengage: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a description or a writing sample first." }, { status: 400 });
  const { samples, customNextSteps, customReengage } = parsed.data;
  if (!samples?.trim() && !customNextSteps?.trim() && !customReengage?.trim()) {
    return NextResponse.json({ error: "Add a writing sample or some go-to lines first." }, { status: 400 });
  }
  try {
    const voice = await learnVoice(parsed.data);
    return NextResponse.json(voice);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
