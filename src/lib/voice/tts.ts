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
import { parseElevenSelection } from "@/lib/voice/eleven";
import { elevenClient, elevenSdkError, streamToArrayBuffer } from "@/lib/voice/eleven-client";
import { expressivenessToStability } from "@/lib/voice/voice-settings";

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

/** ElevenLabs stock voice ids (stable, public catalog). Each house voice maps to
 *  a DISTINCT real ElevenLabs voice (gender/accent matched); anything unmapped
 *  falls back to its group default. The full account catalogue (incl. the org's
 *  own clones) is also selectable live via lib/voice/eleven.ts. */
export const ELEVEN_VOICES: Record<string, string> = {
  af_heart: "9BWtsMINqrJLrRacOk9x", // Aria — warm, expressive female US (current default)
  af_bella: "EXAVITQu4vr4xnSDxMaL", // Sarah — bright female US
  af_nicole: "FGY2WhTYpPnrIDTdsKH5", // Laura — soft female US
  af_nova: "XB0fDUnXU5powFXDhCwa", // Charlotte — confident female
  af_jessica: "cgSgspJ2msm6clMCkdW9", // Jessica — polished female US
  af_river: "SAz9YHcvj6GT2YYXdXww", // River — calm female US
  am_adam: "nPczCjzI2devNBz1zQrb", // Brian — deep, natural male US (current)
  am_michael: "CwhRBWXzGAHq8TQ4Fs17", // Roger — friendly male US (current)
  am_onyx: "pqHfZKP75CvOlQylNhV4", // Bill — deep male US
  am_eric: "cjVigY5qzO86Huf0OWal", // Eric — crisp male US
  am_liam: "TX3LPaxmHKxFdv7VOQHJ", // Liam — approachable male US
  bf_emma: "Xb7hH8MSUJpSbSDYk0k2", // Alice — female UK
  bf_lily: "pFZP5JQG7iQjIQuC4Bku", // Lily — soft female UK
  bm_george: "JBFqnCBsd6RMkjVDRZzb", // George — male UK
  bm_daniel: "onwK4e9ZLuTAKqWW03F9", // Daniel — refined male UK
};

/** OpenAI TTS voice names (the full house catalog mapped to valid OpenAI
 *  voices — a small fixed set, so several house voices share an OpenAI voice;
 *  gender stays matched). */
export const OPENAI_VOICES: Record<string, string> = {
  af_heart: "coral",
  af_bella: "shimmer",
  af_nicole: "sage",
  af_nova: "nova",
  af_sarah: "shimmer",
  af_sky: "coral",
  af_jessica: "sage",
  af_river: "alloy",
  am_adam: "onyx",
  am_michael: "echo",
  am_onyx: "ash",
  am_echo: "echo",
  am_eric: "ash",
  am_liam: "verse",
  am_fenrir: "onyx",
  am_puck: "ballad",
  bf_emma: "ballad",
  bf_alice: "shimmer",
  bf_lily: "coral",
  bm_george: "fable",
  bm_daniel: "onyx",
  bm_lewis: "ash",
  bm_fable: "fable",
};

/** Gender/accent-aware default within the confidently-mapped set. A house voice
 *  without an exact provider mapping still resolves to a voice of the SAME group
 *  (male UK → a male-UK default), never a mismatched one — so adding a new house
 *  voice never makes a hosted call sound like the wrong person. */
function groupDefault(voiceId: string): string {
  const g = voiceId.slice(0, 2);
  if (g === "am") return "am_adam";
  if (g === "bf") return "bf_emma";
  if (g === "bm") return "bm_george";
  return "af_heart"; // af_ and anything unrecognized
}

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
  // An ElevenLabs selection ("eleven:<id>", including the org's own clones) is a
  // real ElevenLabs voice id — pass it straight through on that provider. Other
  // providers can't use it, so they fall back to their own default voice.
  const elevenId = parseElevenSelection(voiceId);
  if (elevenId) {
    if (provider === "elevenlabs") return elevenId;
    voiceId = null;
  }
  const id = voiceId && !voiceId.startsWith("clone:") ? voiceId : DEFAULT_HOUSE_VOICE;
  if (provider === "cartesia") return cartesiaVoice(voiceId);
  if (provider === "elevenlabs") {
    if (env("ELEVENLABS_VOICE_ID") && id === DEFAULT_HOUSE_VOICE) return env("ELEVENLABS_VOICE_ID")!;
    return ELEVEN_VOICES[id] ?? ELEVEN_VOICES[groupDefault(id)] ?? ELEVEN_VOICES[DEFAULT_HOUSE_VOICE];
  }
  if (env("OPENAI_TTS_VOICE") && id === DEFAULT_HOUSE_VOICE) return env("OPENAI_TTS_VOICE")!;
  return OPENAI_VOICES[id] ?? OPENAI_VOICES[groupDefault(id)] ?? OPENAI_VOICES[DEFAULT_HOUSE_VOICE];
}

/** ElevenLabs delivery settings per emotion. Lower stability = more expressive;
 *  `use_speaker_boost` is on everywhere — it tightens fidelity to the reference
 *  voice (the difference that reads as "a real person", which is the make-or-
 *  break on a sales call) for a negligible latency cost on the turbo model. */
export function elevenSettings(emotion?: Emotion, expressiveness?: number): { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean } {
  const boost = { use_speaker_boost: true };
  // An explicit per-org expressiveness wins: it sets stability directly (lower =
  // livelier) and nudges style up with it, overriding the per-emotion default.
  if (typeof expressiveness === "number") {
    const stability = expressivenessToStability(expressiveness);
    return { stability, similarity_boost: 0.78, style: Math.round(Math.min(0.5, expressiveness * 0.5) * 100) / 100, ...boost };
  }
  switch (emotion) {
    case "energetic":
      return { stability: 0.35, similarity_boost: 0.75, style: 0.45, ...boost };
    case "warm":
      return { stability: 0.45, similarity_boost: 0.8, style: 0.3, ...boost };
    case "empathetic":
      return { stability: 0.55, similarity_boost: 0.8, style: 0.25, ...boost };
    case "calm":
      return { stability: 0.65, similarity_boost: 0.8, style: 0.1, ...boost };
    case "confident":
      return { stability: 0.5, similarity_boost: 0.75, style: 0.3, ...boost };
    default:
      return { stability: 0.5, similarity_boost: 0.75, style: 0.2, ...boost };
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
  /** "realtime" (default) optimizes for low latency on live calls — the model
   *  the minute-margin math is priced on. "max" uses the highest-quality
   *  production model for non-realtime audio (read-aloud, previews, the landing
   *  demo) where a second of extra latency is invisible and fidelity is the
   *  whole point. Never use "max" on the live-call path. */
  quality?: "realtime" | "max";
  /** 0–1 per-org expressiveness (overrides the per-emotion ElevenLabs stability). */
  expressiveness?: number;
}

/** The ElevenLabs model id for a quality tier (both env-overridable).
 *  - realtime (live calls): Turbo v2.5 — the quality-first real-time model. Same
 *    per-character credit cost as Flash but noticeably richer/more natural, at
 *    ~250 ms latency (vs Flash's ~75 ms) — an imperceptible trade on a call for
 *    a clearly better voice. Pin ELEVENLABS_MODEL=eleven_flash_v2_5 to favor raw
 *    latency over polish.
 *  - max (read-aloud / previews / demo): multilingual_v2 — ElevenLabs' most
 *    natural production model. Set ELEVENLABS_MODEL_HQ=eleven_v3 once your
 *    account has v3 access for the most expressive output. */
export function elevenModel(quality: "realtime" | "max" = "realtime"): string {
  return quality === "max"
    ? env("ELEVENLABS_MODEL_HQ") ?? "eleven_multilingual_v2"
    : env("ELEVENLABS_MODEL") ?? "eleven_turbo_v2_5";
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
    const client = elevenClient();
    if (!client) throw new Error("ElevenLabs not configured");
    const voice = providerVoice("elevenlabs", input.voiceId);
    const s = elevenSettings(input.emotion, input.expressiveness);
    try {
      // Realtime (calls) → Flash v2.5 (~75 ms, the model the minute-margin
      // math is priced on). Max (read-aloud/previews/demo) → multilingual_v2,
      // ElevenLabs' most natural production model, since latency is invisible
      // there and fidelity is the whole point. See elevenModel().
      const audioStream = await client.textToSpeech.convert(voice, {
        text,
        modelId: elevenModel(input.quality),
        outputFormat: "mp3_44100_128",
        // The SDK takes camelCase settings; our tuner returns the API's
        // snake_case shape, so map it across here (one place, not per caller).
        voiceSettings: {
          stability: s.stability,
          similarityBoost: s.similarity_boost,
          style: s.style,
          useSpeakerBoost: s.use_speaker_boost,
        },
      });
      return { audio: await streamToArrayBuffer(audioStream), mime: "audio/mpeg", provider };
    } catch (e) {
      throw new Error(elevenSdkError("ElevenLabs", e));
    }
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
