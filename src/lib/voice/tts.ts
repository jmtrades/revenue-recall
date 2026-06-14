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

/** A voice available in the org's ElevenLabs account — a premade library voice
 *  or one of their own cloned voices. Surfaced so an operator can discover the
 *  ids to plug into ELEVENLABS_VOICE_MAP (or pick a clone) without leaving the
 *  product. */
export interface ElevenVoiceInfo {
  id: string;
  name: string;
  /** "premade" | "cloned" | "professional" | "generated" — ElevenLabs' grouping. */
  category: string;
  /** ElevenLabs labels (accent, gender, age, use case) when present. */
  labels?: Record<string, string>;
  previewUrl?: string;
}

/** List the voices available to the configured ElevenLabs account (premade +
 *  the operator's own cloned voices). Returns [] when ElevenLabs isn't
 *  configured or on any error — never throws (a discovery helper must not break
 *  the settings page). */
export async function listElevenVoices(): Promise<ElevenVoiceInfo[]> {
  const key = env("ELEVENLABS_API_KEY");
  if (!key) return [];
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as { voices?: unknown[] } | null;
    const voices = Array.isArray(json?.voices) ? json!.voices : [];
    return voices
      .map((v): ElevenVoiceInfo | null => {
        const o = v as { voice_id?: unknown; name?: unknown; category?: unknown; labels?: unknown; preview_url?: unknown };
        if (typeof o.voice_id !== "string" || typeof o.name !== "string") return null;
        return {
          id: o.voice_id,
          name: o.name,
          category: typeof o.category === "string" ? o.category : "premade",
          labels: o.labels && typeof o.labels === "object" ? (o.labels as Record<string, string>) : undefined,
          previewUrl: typeof o.preview_url === "string" ? o.preview_url : undefined,
        };
      })
      .filter((v): v is ElevenVoiceInfo => v !== null);
  } catch {
    return [];
  }
}

// ---- house voice → provider voice maps ----
// The product speaks in house-voice ids everywhere (picker, org setting, call
// gateway). Each hosted provider gets a hand-matched equivalent so "warm
// female · US" sounds warm-female-US on every backend.

/** ElevenLabs stock voice ids (stable, public catalog). Every house voice gets
 *  a hand-matched premium voice from ElevenLabs' default library, so picking a
 *  voice on the best provider gives a DISTINCT voice — not a collapse to the
 *  group default. The handful without an exact premade match (bm_lewis,
 *  bm_fable) resolve to their group (UK male → George) and can be pointed at any
 *  voice — including a cloned one — via ELEVENLABS_VOICE_MAP. */
export const ELEVEN_VOICES: Record<string, string> = {
  // US female
  af_heart: "21m00Tcm4TlvDq8ikWAM", // Rachel — warm female US (default)
  af_bella: "EXAVITQu4vr4xnSDxMaL", // Sarah — bright female US
  af_nicole: "FGY2WhTYpPnrIDTdsKH5", // Laura — soft female US
  af_nova: "XB0fDUnXU5powFXDhCwa", // Charlotte — confident female
  af_sarah: "cgSgspJ2msm6clMCkdW9", // Jessica — clear, conversational female US
  af_sky: "9BWtsMINqrJLrRacOk9x", // Aria — youthful female US
  af_jessica: "XrExE9yKIg1WjnnlVkGX", // Matilda — polished, warm female US
  af_river: "SAz9YHcvj6GT2YYXdXww", // River — calm, neutral female US
  // US male
  am_adam: "pNInz6obpgDQGcFmaJgB", // Adam — steady male US
  am_michael: "TxGEqnHWrfWFTfGW9XjX", // Josh — friendly male US
  am_onyx: "onwK4e9ZLuTAKqWW03F9", // Daniel — deep male
  am_echo: "iP95p4xoKVk53GoZ742B", // Chris — even, casual male US
  am_eric: "cjVigY5qzO86Huf0OWal", // Eric — crisp, classy male US
  am_liam: "TX3LPaxmHKxFdv7VOQHJ", // Liam — approachable male US
  am_fenrir: "nPczCjzI2devNBz1zQrb", // Brian — bold, deep male US
  am_puck: "bIHbv24MWmeRgasZH58o", // Will — upbeat, young male US
  // UK female
  bf_emma: "Xb7hH8MSUJpSbSDYk0k2", // Alice — female UK
  bf_alice: "ThT5KcBeYPX3keUQqHPh", // Dorothy — bright female UK
  bf_lily: "pFZP5JQG7iQjIQuC4Bku", // Lily — soft female UK
  // UK male
  bm_george: "JBFqnCBsd6RMkjVDRZzb", // George — warm male UK (storyteller)
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

/** Resolve a house/clone voice id to an ElevenLabs voice. Precedence:
 *  1. ELEVENLABS_VOICE_MAP — a JSON env override mapping ANY house voice to ANY
 *     ElevenLabs voice id (a premade, a library voice, or your own cloned voice),
 *     so an operator can curate "the best voices" with no deploy and correct any
 *     id ElevenLabs ever retires.
 *  2. ELEVENLABS_VOICE_ID — the single default-voice override (back-compat).
 *  3. The built-in ELEVEN_VOICES catalog, then a same-group default.
 *  clone:<id> voices (cloning is the in-house model's job) use the default. */
export function elevenVoice(voiceId?: string | null): string {
  const id = voiceId && !voiceId.startsWith("clone:") ? voiceId : DEFAULT_HOUSE_VOICE;
  const raw = env("ELEVENLABS_VOICE_MAP");
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      if (typeof map[id] === "string" && map[id]) return map[id];
    } catch {
      /* malformed map — fall through to the built-in catalog */
    }
  }
  if (env("ELEVENLABS_VOICE_ID") && id === DEFAULT_HOUSE_VOICE) return env("ELEVENLABS_VOICE_ID")!;
  return ELEVEN_VOICES[id] ?? ELEVEN_VOICES[groupDefault(id)] ?? ELEVEN_VOICES[DEFAULT_HOUSE_VOICE];
}

/** Resolve a house/clone voice id to the provider's voice. Unknown ids and
 *  clone:<id> voices (cloning is the in-house model's job) use the default. */
export function providerVoice(provider: TtsProvider, voiceId?: string | null): string {
  const id = voiceId && !voiceId.startsWith("clone:") ? voiceId : DEFAULT_HOUSE_VOICE;
  if (provider === "cartesia") return cartesiaVoice(voiceId);
  if (provider === "elevenlabs") return elevenVoice(voiceId);
  if (env("OPENAI_TTS_VOICE") && id === DEFAULT_HOUSE_VOICE) return env("OPENAI_TTS_VOICE")!;
  return OPENAI_VOICES[id] ?? OPENAI_VOICES[groupDefault(id)] ?? OPENAI_VOICES[DEFAULT_HOUSE_VOICE];
}

/** ElevenLabs delivery settings per emotion. Lower stability = more expressive;
 *  `use_speaker_boost` is on everywhere — it tightens fidelity to the reference
 *  voice (the difference that reads as "a real person", which is the make-or-
 *  break on a sales call) for a negligible latency cost on the turbo model. */
export function elevenSettings(emotion?: Emotion): { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean } {
  const boost = { use_speaker_boost: true };
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
}

/** The ElevenLabs model id for a quality tier (both env-overridable). Flash for
 *  realtime calls; multilingual_v2 — ElevenLabs' most natural production model —
 *  for max-quality non-realtime speech. */
export function elevenModel(quality: "realtime" | "max" = "realtime"): string {
  return quality === "max"
    ? env("ELEVENLABS_MODEL_HQ") ?? "eleven_multilingual_v2"
    : env("ELEVENLABS_MODEL") ?? "eleven_flash_v2_5";
}

/** ElevenLabs output format per quality tier. Max (previews/demo/read-aloud —
 *  HD playback where fidelity is the whole point) defaults to 192 kbps MP3, the
 *  highest-fidelity browser-playable format; realtime stays full-band 128 kbps
 *  for latency. `ELEVENLABS_OUTPUT_FORMAT` overrides the max tier (e.g.
 *  `pcm_44100` for lossless if your pipeline can play it, or `mp3_44100_128` on
 *  a free ElevenLabs tier that doesn't allow 192). A format the account's tier
 *  doesn't permit just 4xxs and the client falls back to the browser voice —
 *  never a hard failure. */
export function elevenOutputFormat(quality: "realtime" | "max" = "realtime"): string {
  if (quality === "max") return env("ELEVENLABS_OUTPUT_FORMAT") ?? "mp3_44100_192";
  return "mp3_44100_128";
}

/** MIME for an ElevenLabs output_format token. */
export function elevenMime(format: string): string {
  if (format.startsWith("wav")) return "audio/wav";
  if (format.startsWith("ulaw") || format.startsWith("alaw")) return "audio/basic";
  if (format.startsWith("pcm")) return "audio/L16";
  return "audio/mpeg"; // mp3_*
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
    const format = elevenOutputFormat(input.quality);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=${format}`, {
      method: "POST",
      headers: { "xi-api-key": env("ELEVENLABS_API_KEY")!, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Realtime (calls) → Flash v2.5 (~75 ms, the model the minute-margin
        // math is priced on). Max (read-aloud/previews/demo) → multilingual_v2,
        // ElevenLabs' most natural production model, at the highest-fidelity
        // browser-playable bitrate — latency is invisible there and fidelity is
        // the whole point. See elevenModel() / elevenOutputFormat().
        text,
        model_id: elevenModel(input.quality),
        voice_settings: elevenSettings(input.emotion),
      }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
    return { audio: await res.arrayBuffer(), mime: elevenMime(format), provider };
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
