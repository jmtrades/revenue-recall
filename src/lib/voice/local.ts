/**
 * On-device neural voice — Kokoro-82M running 100% in the browser (WebGPU when
 * available, WASM otherwise). This is the cost-free default the product was
 * designed around: the house voice ids (af_heart, am_adam, …) ARE Kokoro voice
 * ids, the model is Apache-licensed, and after a one-time cached download every
 * line is synthesized locally — no vendor, no per-character bill, audio never
 * leaves the device.
 *
 * Loading is lazy and quiet: preloadLocalVoice() kicks off in the background
 * when the app shell mounts; until it's ready (or if the device can't run it)
 * available() is false and callers transparently use the next engine down.
 */
import { EMOTIONS, type Emotion, speakable, type SpeakHandle } from "@/lib/voice/speech";
import type { VoiceSynth, SpeakOptions } from "@/lib/voice/synth";
import { HOUSE_VOICES, DEFAULT_HOUSE_VOICE } from "@/lib/voice/house";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

interface KokoroLike {
  generate(text: string, opts: { voice: string; speed: number }): Promise<{ audio: Float32Array; sampling_rate: number }>;
}

let state: "idle" | "loading" | "ready" | "failed" = "idle";
let tts: KokoroLike | null = null;
let progress = 0; // 0..1 download progress, for a friendly "warming up" UI
const readyWaiters: ((ok: boolean) => void)[] = [];

function settle(ok: boolean): void {
  while (readyWaiters.length) readyWaiters.shift()!(ok);
}

/** Resolve any voice id to one Kokoro can speak: known house ids pass through;
 *  clone:<id> (the gateway's job) and unknowns use the default. Exported for tests. */
export function resolveLocalVoice(voiceId?: string | null): string {
  if (voiceId && HOUSE_VOICES.some((v) => v.id === voiceId)) return voiceId;
  return DEFAULT_HOUSE_VOICE;
}

/** Speaking speed for Kokoro: the rep's rate preference folded with the line's
 *  emotional delivery, clamped to the model's sane range. Exported for tests. */
export function localSpeed(rate?: number, emotion?: Emotion): number {
  const emo = EMOTIONS[emotion ?? "neutral"] ?? EMOTIONS.neutral;
  const v = (rate ?? 1) * emo.rateMul;
  return Math.min(1.5, Math.max(0.5, Number(v.toFixed(2))));
}

export function localVoiceState(): typeof state {
  return state;
}

/** Download progress, 0..1, while the model loads. Approximate (the engine
 *  reports per-file), but smooth enough for a "warming up the voice" bar. */
export function localVoiceProgress(): number {
  return progress;
}

/** Trigger loading (if needed) and resolve when the on-device voice is usable
 *  (true) or definitively can't run here (false). The landing demo awaits this
 *  on first click instead of polling. */
export function ensureLocalVoice(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false); // SSR — can't run
  if (state === "ready") return Promise.resolve(true);
  if (state === "failed") return Promise.resolve(false);
  preloadLocalVoice();
  return new Promise<boolean>((resolve) => readyWaiters.push(resolve));
}

/** Begin loading the model in the background (no-op on the server, when
 *  already started, or after a failure). Safe to call repeatedly. */
export function preloadLocalVoice(): void {
  if (typeof window === "undefined" || state !== "idle") return;
  state = "loading";
  (async () => {
    // Load the prebuilt, self-contained browser bundle staged at /vendor by
    // scripts/copy-kokoro.mjs. `webpackIgnore` keeps the bundler from ever
    // parsing the transformers/onnx stack (its import.meta + native bindings
    // break webpack); the browser fetches the ESM directly — same-origin, so
    // CSP stays at script-src 'self'.
    const { KokoroTTS } = (await import(/* webpackIgnore: true */ "/vendor/kokoro.web.js" as string)) as {
      KokoroTTS: { from_pretrained(model: string, opts: { device: string; dtype: string; progress_callback?: (p: { progress?: number }) => void }): Promise<unknown> };
    };
    const hasWebGpu = "gpu" in navigator;
    // WebGPU runs fp32 fast; WASM needs the q8 quant to stay responsive.
    const loaded = (await KokoroTTS.from_pretrained(MODEL_ID, {
      ...(hasWebGpu ? { device: "webgpu", dtype: "fp32" } : { device: "wasm", dtype: "q8" }),
      progress_callback: (p) => {
        if (typeof p?.progress === "number") progress = Math.max(progress, Math.min(0.99, p.progress / 100));
      },
    })) as unknown as KokoroLike;
    tts = loaded;
    progress = 1;
    state = "ready";
    settle(true);
  })().catch(() => {
    state = "failed"; // old browser / blocked download — the next engine takes over
    settle(false);
  });
}

function localSpeak(text: string, opts: SpeakOptions): SpeakHandle {
  let stopped = false;
  let ctx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;

  const done = (async () => {
    if (!tts) return;
    try {
      const out = await tts.generate(speakable(text), {
        voice: resolveLocalVoice(opts.voiceId ?? opts.preferName),
        speed: localSpeed(opts.rate, opts.emotion),
      });
      if (stopped || !out?.audio?.length) return;
      const AC: typeof AudioContext =
        (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const buf = ctx.createBuffer(1, out.audio.length, out.sampling_rate);
      buf.copyToChannel(out.audio as never, 0);
      source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      await new Promise<void>((resolve) => {
        if (!source || stopped) return resolve();
        source.onended = () => resolve();
        source.start();
      });
    } catch {
      /* a single failed line resolves quietly; the engine stays registered */
    } finally {
      try { ctx?.close(); } catch { /* already closed */ }
    }
  })();

  return {
    done,
    stop: () => {
      stopped = true;
      try { source?.stop(); } catch { /* not started */ }
      try { ctx?.close(); } catch { /* already closed */ }
    },
  };
}

/** The on-device engine, satisfying the VoiceSynth contract. */
export const localSynth: VoiceSynth = {
  id: "rr-kokoro-local",
  kind: "neural",
  available: () => typeof window !== "undefined" && state === "ready",
  async speak(text, opts = {}) {
    return localSpeak(text, opts);
  },
};
