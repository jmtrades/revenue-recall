import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { ttsAvailable, synthesizeSpeech } from "@/lib/voice/tts";
import { DEMO_LINES } from "@/lib/voice/demo-lines";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Public ElevenLabs preview for the landing VoiceDemo. Unauthenticated (the demo
 * runs for logged-out visitors) but tightly bounded: it can ONLY synthesize the
 * fixed `DEMO_LINES` by index — never caller-supplied text — and each line is
 * generated once per warm instance then served from an in-memory cache, so the
 * ElevenLabs spend is a handful of clips total regardless of traffic. Rate-limited
 * on top. Returns 503 when no ElevenLabs key is configured (the demo then shows an
 * honest "preview unavailable" state — voice is ElevenLabs-only, no fallback).
 */

// line index → generated audio. Ephemeral across cold starts (fine for a preview).
const cache = new Map<number, { audio: ArrayBuffer; mime: string }>();

export const GET = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "voice-preview"), 20, 60_000).ok) {
    return NextResponse.json({ error: "Too many previews — give it a second." }, { status: 429 });
  }
  if (!ttsAvailable()) {
    return NextResponse.json({ error: "Voice preview isn't configured." }, { status: 503 });
  }
  const line = Number(new URL(req.url).searchParams.get("line"));
  if (!Number.isInteger(line) || line < 0 || line >= DEMO_LINES.length) {
    return NextResponse.json({ error: "Unknown demo line." }, { status: 400 });
  }

  const hit = cache.get(line);
  if (hit) return audio(hit.audio, hit.mime);

  const l = DEMO_LINES[line];
  try {
    const out = await synthesizeSpeech({ text: l.text, voiceId: l.voiceId, emotion: l.emotion, quality: "max" });
    cache.set(line, { audio: out.audio, mime: out.mime });
    return audio(out.audio, out.mime);
  } catch {
    return NextResponse.json({ error: "Couldn't generate the preview." }, { status: 502 });
  }
});

function audio(buf: ArrayBuffer, mime: string): Response {
  return new Response(buf, {
    headers: {
      "Content-Type": mime,
      // Safe to cache hard — fixed line, never personalized.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
