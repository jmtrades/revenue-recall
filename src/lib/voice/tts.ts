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
import { elevenClient, elevenSdkError, elevenErrorStatus, streamToArrayBuffer } from "@/lib/voice/eleven-client";
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
  // 1:1 with HOUSE_VOICES — every id is a DISTINCT premade voice, and the house
  // label IS this voice's real ElevenLabs name, so picks never sound the same.
  af_heart: "9BWtsMINqrJLrRacOk9x", // Aria
  af_sarah: "EXAVITQu4vr4xnSDxMaL", // Sarah
  af_nicole: "FGY2WhTYpPnrIDTdsKH5", // Laura
  af_nova: "XB0fDUnXU5powFXDhCwa", // Charlotte
  af_jessica: "cgSgspJ2msm6clMCkdW9", // Jessica
  af_river: "SAz9YHcvj6GT2YYXdXww", // River
  af_sky: "XrExE9yKIg1WjnnlVkGX", // Matilda
  am_adam: "nPczCjzI2devNBz1zQrb", // Brian
  am_michael: "CwhRBWXzGAHq8TQ4Fs17", // Roger
  am_onyx: "pqHfZKP75CvOlQylNhV4", // Bill
  am_eric: "cjVigY5qzO86Huf0OWal", // Eric
  am_liam: "TX3LPaxmHKxFdv7VOQHJ", // Liam
  am_echo: "bIHbv24MWmeRgasZH58o", // Will
  am_fenrir: "iP95p4xoKVk53GoZ742B", // Chris
  am_puck: "N2lVS1w4EtoT3dr4eOWO", // Callum
  bf_emma: "Xb7hH8MSUJpSbSDYk0k2", // Alice
  bf_lily: "pFZP5JQG7iQjIQuC4Bku", // Lily
  bm_george: "JBFqnCBsd6RMkjVDRZzb", // George
  bm_daniel: "onwK4e9ZLuTAKqWW03F9", // Daniel
};

/** OpenAI TTS voice names (the full house catalog mapped to valid OpenAI
 *  voices — a small fixed set, so several house voices share an OpenAI voice;
 *  gender stays matched). */
export const OPENAI_VOICES: Record<string, string> = {
  af_heart: "coral",
  af_sarah: "shimmer",
  af_nicole: "sage",
  af_nova: "nova",
  af_jessica: "sage",
  af_river: "alloy",
  af_sky: "coral",
  am_adam: "onyx",
  am_michael: "echo",
  am_onyx: "ash",
  am_eric: "ash",
  am_liam: "verse",
  am_echo: "echo",
  am_fenrir: "onyx",
  am_puck: "ballad",
  bf_emma: "shimmer",
  bf_lily: "coral",
  bm_george: "fable",
  bm_daniel: "onyx",
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

/** Ordered ElevenLabs model candidates for a quality tier (env-overridable).
 *  - max (read-aloud / previews / demo): prefer eleven_v3 — ElevenLabs' most
 *    expressive model — but ALWAYS keep eleven_multilingual_v2 as a proven
 *    fallback, so an account without v3 access (or a request v3 rejects) still
 *    produces audio. synthesizeSpeech walks this list and remembers any model
 *    the account can't use, so the best available model wins and read-aloud can
 *    never break. Pin ELEVENLABS_MODEL_HQ to force a single max-tier model.
 *  - realtime (live calls): a single model — the latency budget on a live call
 *    leaves no room for a retry. Turbo v2.5 by default (quality-first; same
 *    per-character cost as Flash, ~250 ms vs ~75 ms). Pin ELEVENLABS_MODEL=
 *    eleven_flash_v2_5 to favor raw latency over polish. */
export function elevenModelChain(quality: "realtime" | "max"): string[] {
  if (quality === "max") {
    const hq = env("ELEVENLABS_MODEL_HQ");
    return hq ? [hq] : ["eleven_v3", "eleven_multilingual_v2"];
  }
  return [env("ELEVENLABS_MODEL") ?? "eleven_turbo_v2_5"];
}

/** The primary model id for a quality tier (the first/best candidate). */
export function elevenModel(quality: "realtime" | "max" = "realtime"): string {
  return elevenModelChain(quality)[0];
}

/** Whether an ElevenLabs error means "this MODEL isn't usable on this account"
 *  (try the next candidate) vs. a transient/rate/auth error (don't burn the
 *  fallback — let the caller degrade to the browser voice). A 4xx that isn't
 *  401 (auth) or 429 (rate limit) is treated as a model/validation problem.
 *  Pure + tested. */
export function elevenModelUnavailable(status: number | undefined): boolean {
  if (typeof status !== "number") return false;
  if (status === 401 || status === 429) return false;
  return status >= 400 && status < 500;
}

export interface SynthesizedAudio {
  audio: ArrayBuffer;
  mime: string;
  provider: TtsProvider;
}

// ElevenLabs models this account has proven it can't use this session (e.g. no
// eleven_v3 access). Populated lazily by synthesizeSpeech so the very next
// read-aloud skips the dud and goes straight to the working fallback — the best
// available model wins, with at most one failed round-trip ever.
const elevenUnavailableModels = new Set<string>();

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
    // Walk the quality tier's model candidates (max prefers eleven_v3 → falls
    // back to multilingual_v2), skipping any this account has already proven it
    // can't use. The SDK takes camelCase settings; our tuner returns the API's
    // snake_case shape, so map it across here (one place, not per caller).
    const candidates = elevenModelChain(input.quality ?? "realtime").filter((m) => !elevenUnavailableModels.has(m));
    const models = candidates.length ? candidates : ["eleven_multilingual_v2"];
    let lastErr: unknown;
    for (let i = 0; i < models.length; i++) {
      const modelId = models[i];
      try {
        const audioStream = await client.textToSpeech.convert(voice, {
          text,
          modelId,
          outputFormat: "mp3_44100_128",
          voiceSettings: {
            stability: s.stability,
            similarityBoost: s.similarity_boost,
            style: s.style,
            useSpeakerBoost: s.use_speaker_boost,
          },
        });
        return { audio: await streamToArrayBuffer(audioStream), mime: "audio/mpeg", provider };
      } catch (e) {
        lastErr = e;
        // If this model is the problem (not auth/rate/transient) and there's a
        // proven fallback left, remember the dud and try it — once per session,
        // so the next read-aloud goes straight to the working model.
        if (i < models.length - 1 && elevenModelUnavailable(elevenErrorStatus(e))) {
          elevenUnavailableModels.add(modelId);
          continue;
        }
        throw new Error(elevenSdkError("ElevenLabs", e));
      }
    }
    throw new Error(elevenSdkError("ElevenLabs", lastErr));
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
