import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { isEntitled } from "@/lib/billing/enforce";
import { ttsAvailable, ttsProvider, synthesizeSpeech } from "@/lib/voice/tts";
import { EMOTIONS } from "@/lib/voice/speech";

export const dynamic = "force-dynamic";

/**
 * Hosted neural text-to-speech. Session-gated by the middleware (it spends
 * provider money), and live-AI entitlement applies like every other live AI
 * feature. The client probes GET once and registers the hosted synth only when
 * it's genuinely usable — so an unconfigured deploy keeps the browser voice
 * with zero errors anywhere.
 */
export const GET = withGuard(async () => {
  const available = ttsAvailable() && (await isEntitled("aiLive"));
  return NextResponse.json({ available, provider: available ? ttsProvider() : null });
});

const Body = z.object({
  text: z.string().min(1).max(1500),
  voiceId: z.string().max(80).optional(),
  emotion: z.enum(Object.keys(EMOTIONS) as [string, ...string[]]).optional(),
  rate: z.number().min(0.5).max(1.5).optional(),
  lang: z.string().max(16).optional(),
});

export const POST = withGuard(async (req: Request) => {
  if (!ttsAvailable()) {
    return NextResponse.json({ error: "No hosted voice configured" }, { status: 503 });
  }
  if (!(await isEntitled("aiLive"))) {
    return NextResponse.json({ error: "Live AI voice is available on paid plans." }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const out = await synthesizeSpeech({
      text: parsed.data.text,
      voiceId: parsed.data.voiceId,
      emotion: parsed.data.emotion as never,
      rate: parsed.data.rate,
      lang: parsed.data.lang,
    });
    return new Response(out.audio, {
      headers: {
        "Content-Type": out.mime,
        "Cache-Control": "no-store",
        "X-RR-TTS-Provider": out.provider,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Synthesis failed" }, { status: 502 });
  }
});
