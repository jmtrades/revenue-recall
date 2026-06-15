import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { isEntitled } from "@/lib/billing/enforce";
import { ttsAvailable, ttsProvider, synthesizeSpeech } from "@/lib/voice/tts";
import { EMOTIONS } from "@/lib/voice/speech";
import { getOrgSettings } from "@/lib/org";

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
  expressiveness: z.number().min(0).max(1).optional(),
  lang: z.string().max(16).optional(),
  // This in-app route is read-aloud/previews (non-realtime), so it defaults to
  // the highest-quality model; a caller may pass "realtime" to opt into the
  // low-latency call model.
  quality: z.enum(["realtime", "max"]).optional(),
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
  // Fill unset fields from the org's saved voice: the chosen ElevenLabs voice,
  // and its speaking speed + expressiveness — so every read-aloud speaks in the
  // org's tuned voice unless the caller explicitly overrides.
  const org = await getOrgSettings().catch(() => null);
  const voiceId = parsed.data.voiceId || org?.ttsVoiceId || undefined;
  const rate = parsed.data.rate ?? org?.voiceSettings.rate;
  const expressiveness = parsed.data.expressiveness ?? org?.voiceSettings.expressiveness;
  try {
    const out = await synthesizeSpeech({
      text: parsed.data.text,
      voiceId,
      emotion: parsed.data.emotion as never,
      rate,
      expressiveness,
      lang: parsed.data.lang,
      quality: parsed.data.quality ?? "max", // read-aloud/previews want fidelity, not latency
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
