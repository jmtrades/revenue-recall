/**
 * Hosted neural TTS — the "sounds like a real person TODAY" path. Same
 * philosophy as the comms layer: provider-agnostic, nothing required, the
 * feature lights up the moment ONE key is set and degrades to the browser
 * engine when none is. Priority: ElevenLabs (most human) → OpenAI.
 *
 * This is the hot-path complement to docs/neural-voice.md: the in-house
 * streaming model (NEXT_PUBLIC_NEURAL_VOICE_URL) stays the end-state and takes
 * priority on the client when it exists; this route makes every spoken surface
 * human-grade in the meantime with zero caller changes.
 */
import { speakable, type Emotion } from "@/lib/voice/speech";
import { DEFAULT_HOUSE_VOICE } from "@/lib/voice/house";

export type TtsProvider = "cartesia" | "elevenlabs" | "openai";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function cartesiaReady(): boolean {
  // Cartesia addresses voices by UUID (no stable public catalog to hand-map),
  // so it needs BOTH the key and a default voice id to be usable.
  return Boolean(env("CARTESIA_API_KEY") && env("CARTESIA_VOICE_ID"));
}

/** Which hosted provider answers. `VOICE_TTS_PROVIDER` pins one explicitly
 *  (honored only if that provider is actually configured); otherwise priority
 *  is QUALITY-first: ElevenLabs (the most human voice on the market — the
 *  make-or-break of a sales call, priced into every plan's minute allowance,
 *  see billing/voice-minutes.ts) → Cartesia (excellent latency, ~half the
 *  cost) → OpenAI. Pin VOICE_TTS_PROVIDER=cartesia to trade a little polish
 *  for margin. */
export function ttsProvider(): TtsProvider | null {
  const ready: Record<TtsProvider, boolean> = {
    cartesia: cartesiaReady(),
    elevenlabs: Boolean(env("ELEVENLABS_API_KEY")),
    openai: Boolean(env("OPENAI_API_KEY") || env("OPENAI_TTS_API_KEY")),
  };
  const pin = env("VOICE_TTS_PROVIDER") as TtsProvider | undefined;
  if (pin && ready[pin]) return pin;
  if (ready.elevenlabs) return "elevenlabs";
  if (ready.cartesia) return "cartesia";
  if (ready.openai) return "openai";
  return null;
}

export function ttsAvailable(): boolean {
  return ttsProvider() !== null;
}

// ---- house voice → provider voice maps ----
// The product speaks in house-voice ids everywhere (picker, org setting, call
// gateway). Each hosted provider gets a hand-matched equivalent so "warm
// female · US" sounds warm-female-US on every backend.

/** ElevenLabs stock voice ids (stable, public catalog). */
export const ELEVEN_VOICES: Record<string, string> = {
  af_heart: "21m00Tcm4TlvDq8ikWAM", // Rachel — warm female US
  af_bella: "EXAVITQu4vr4xnSDxMaL", // Sarah — bright female US
  af_nicole: "FGY2WhTYpPnrIDTdsKH5", // Laura — soft female US
  af_nova: "XB0fDUnXU5powFXDhCwa", // Charlotte — confident female
  am_adam: "pNInz6obpgDQGcFmaJgB", // Adam — steady male US
  am_michael: "TxGEqnHWrfWFTfGW9XjX", // Josh — friendly male US
  am_onyx: "onwK4e9ZLuTAKqWW03F9", // Daniel — deep male
  bf_emma: "Xb7hH8MSUJpSbSDYk0k2", // Alice — female UK
  bm_george: "JBFqnCBsd6RMkjVDRZzb", // George — male UK
};

/** OpenAI TTS voice names. */
export const OPENAI_VOICES: Record<string, string> = {
  af_heart: "coral",
  af_bella: "shimmer",
  af_nicole: "sage",
  af_nova: "nova",
  am_adam: "onyx",
  am_michael: "echo",
  am_onyx: "ash",
  bf_emma: "ballad",
  bm_george: "fable",
};

/** Optional per-house-voice override map for Cartesia (JSON env), since its
 *  voices are account-scoped UUIDs: CARTESIA_VOICE_MAP='{"af_heart":"<uuid>",…}'.
 *  Anything unmapped uses CARTESIA_VOICE_ID. Exported for tests. */
export function cartesiaVoice(voiceId?: string | null): string {
  const fallback = env("CARTESIA_VOICE_ID") ?? "";
  // Clones are the in-house model's job and unknown ids have no mapping —
  // both use the account default, never another voice's premium mapping.
  if (!voiceId || voiceId.startsWith("clone:")) return fallback;
  const raw = env("CARTESIA_VOICE_MAP");
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      if (typeof map[voiceId] === "string" && map[voiceId]) return map[voiceId];
    } catch {
      /* malformed map — fall through to the default voice */
    }
  }
  return fallback;
}

/** Resolve a house/clone voice id to the provider's voice. Unknown ids and
 *  clone:<id> voices (cloning is the in-house model's job) use the default. */
export function providerVoice(provider: TtsProvider, voiceId?: string | null): string {
  const id = voiceId && !voiceId.startsWith("clone:") ? voiceId : DEFAULT_HOUSE_VOICE;
  if (provider === "cartesia") return cartesiaVoice(voiceId);
  if (provider === "elevenlabs") {
    return env("ELEVENLABS_VOICE_ID") && id === DEFAULT_HOUSE_VOICE
      ? env("ELEVENLABS_VOICE_ID")!
      : ELEVEN_VOICES[id] ?? ELEVEN_VOICES[DEFAULT_HOUSE_VOICE];
  }
  return env("OPENAI_TTS_VOICE") && id === DEFAULT_HOUSE_VOICE
    ? env("OPENAI_TTS_VOICE")!
    : OPENAI_VOICES[id] ?? OPENAI_VOICES[DEFAULT_HOUSE_VOICE];
}

/** ElevenLabs delivery settings per emotion. Lower stability = more expressive. */
export function elevenSettings(emotion?: Emotion): { stability: number; similarity_boost: number; style: number } {
  switch (emotion) {
    case "energetic":
      return { stability: 0.35, similarity_boost: 0.75, style: 0.45 };
    case "warm":
      return { stability: 0.45, similarity_boost: 0.8, style: 0.3 };
    case "empathetic":
      return { stability: 0.55, similarity_boost: 0.8, style: 0.25 };
    case "calm":
      return { stability: 0.65, similarity_boost: 0.8, style: 0.1 };
    case "confident":
      return { stability: 0.5, similarity_boost: 0.75, style: 0.3 };
    default:
      return { stability: 0.5, similarity_boost: 0.75, style: 0.2 };
  }
}

/** OpenAI gpt-4o-mini-tts is instruction-steerable — describe the delivery. */
export function openaiInstructions(emotion?: Emotion): string {
  const base = "You are a friendly, experienced sales rep on a call. Sound completely natural and human — conversational pacing, light natural emphasis, never robotic or announcer-like.";
  switch (emotion) {
    case "energetic":
      return `${base} Upbeat and quick, like you have good news.`;
    case "warm":
      return `${base} Warm and personable, with a smile in the voice.`;
    case "empathetic":
      return `${base} Gentle and understanding; slow down, soften.`;
    case "calm":
      return `${base} Measured and reassuring.`;
    case "confident":
      return `${base} Steady and assured, like you've done this a thousand times.`;
    default:
      return base;
  }
}

export interface SynthesizeInput {
  text: string;
  voiceId?: string | null;
  emotion?: Emotion;
  /** 0.5–1.5; provider-side speaking speed (OpenAI honors it; ElevenLabs ignores). */
  rate?: number;
  lang?: string;
}

export interface SynthesizedAudio {
  audio: ArrayBuffer;
  mime: string;
  provider: TtsProvider;
}

/** Synthesize speech with the configured provider. Throws when none is
 *  configured or the provider errors — the route maps that to a clean JSON
 *  error and the client falls back to the browser engine. */
export async function synthesizeSpeech(input: SynthesizeInput): Promise<SynthesizedAudio> {
  const provider = ttsProvider();
  if (!provider) throw new Error("No hosted TTS provider configured");
  const text = speakable(input.text).slice(0, 1500);

  if (provider === "cartesia") {
    const res = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": env("CARTESIA_API_KEY")!,
        "Cartesia-Version": env("CARTESIA_VERSION") ?? "2024-06-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: env("CARTESIA_MODEL") ?? "sonic-2",
        transcript: text,
        voice: { mode: "id", id: providerVoice("cartesia", input.voiceId) },
        output_format: { container: "mp3", bit_rate: 128000, sample_rate: 44100 },
        ...(input.lang ? { language: input.lang.slice(0, 2) } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Cartesia ${res.status}`);
    return { audio: await res.arrayBuffer(), mime: "audio/mpeg", provider };
  }

  if (provider === "elevenlabs") {
    const voice = providerVoice("elevenlabs", input.voiceId);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env("ELEVENLABS_API_KEY")!, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: env("ELEVENLABS_MODEL") ?? "eleven_turbo_v2_5",
        voice_settings: elevenSettings(input.emotion),
      }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
    return { audio: await res.arrayBuffer(), mime: "audio/mpeg", provider };
  }

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("OPENAI_TTS_API_KEY") ?? env("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env("OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts",
      voice: providerVoice("openai", input.voiceId),
      input: text,
      instructions: openaiInstructions(input.emotion),
      speed: Math.min(1.5, Math.max(0.5, input.rate ?? 1)),
      response_format: "mp3",
    }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}`);
  return { audio: await res.arrayBuffer(), mime: "audio/mpeg", provider };
}
