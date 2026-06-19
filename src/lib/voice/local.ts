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

// The on-device model weights. Defaults to the Apache-licensed Kokoro on the
// Hugging Face Hub, but an operator who wants ZERO third-party-CDN dependency can
// mirror the weights on their own origin and point NEXT_PUBLIC_KOKORO_MODEL at it
// (a hub repo id or a same-origin base path). Either way a failed load degrades
// gracefully to the next voice engine (see the catch in preloadLocalVoice).
const MODEL_ID = process.env.NEXT_PUBLIC_KOKORO_MODEL || "onnx-community/Kokoro-82M-v1.0-ONNX";

interface RawAudioLike {
  audio: Float32Array;
  sampling_rate: number;
}
interface KokoroLike {
  generate(text: string, opts: { voice: string; speed: number }): Promise<RawAudioLike>;
  /** Sentence-streamed synthesis — yields audio per phrase as it's generated. */
  stream?(text: string, opts: { voice: string; speed: number }): AsyncGenerator<{ text: string; audio: RawAudioLike }>;
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
  // An explicit user action (tapping play) is consent — load even on Data Saver.
  preloadLocalVoice(true);
  return new Promise<boolean>((resolve) => readyWaiters.push(resolve));
}

/** True when the user asked the browser to conserve data — don't pull ~90 MB
 *  in the background on their behalf. An explicit tap still can (`force`). */
function saveDataOn(): boolean {
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
  return Boolean(conn?.saveData);
}

/** Begin loading the model in the background (no-op on the server, when
 *  already started, after a failure, or — unless forced by an explicit user
 *  action — when Data Saver is on). Safe to call repeatedly. */
export function preloadLocalVoice(force = false): void {
  if (typeof window === "undefined" || state !== "idle") return;
  if (!force && saveDataOn()) return; // respectful: wait for an explicit tap
  state = "loading";
  (async () => {
    // Load the prebuilt, self-contained browser bundle staged at /vendor by
    // scripts/copy-kokoro.mjs. `webpackIgnore` keeps the bundler from ever
    // parsing the transformers/onnx stack (its import.meta + native bindings
    // break webpack); the browser fetches the ESM directly — same-origin, so
    // CSP stays at script-src 'self'.
    // Both magic comments matter: webpackIgnore for the Next build, vite-ignore
    // for vitest — each tells its bundler "this is a runtime URL, hands off".
    const kokoroUrl = "/vendor/kokoro.web.js";
    const { KokoroTTS } = (await import(/* webpackIgnore: true */ /* @vite-ignore */ kokoroUrl)) as {
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
  const sources: AudioBufferSourceNode[] = [];

  const makeCtx = () => {
    const AC: typeof AudioContext =
      (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    return new AC();
  };

  const done = (async () => {
    if (!tts) return;
    const voice = resolveLocalVoice(opts.voiceId ?? opts.preferName);
    const speed = localSpeed(opts.rate, opts.emotion);
    const line = speakable(text);
    try {
      // Sentence-streamed synthesis: the first phrase starts PLAYING while the
      // rest is still generating — speech begins near-instantly and flows like
      // a person talking, instead of a long silent wait then a monologue.
      // Chunks are scheduled gaplessly on one WebAudio clock.
      if (typeof tts.stream === "function") {
        ctx = makeCtx();
        let playhead = ctx.currentTime + 0.04;
        let lastEnd = playhead;
        for await (const chunk of tts.stream(line, { voice, speed })) {
          if (stopped) break;
          const a = chunk?.audio;
          if (!a?.audio?.length || !ctx) continue;
          const buf = ctx.createBuffer(1, a.audio.length, a.sampling_rate);
          buf.copyToChannel(a.audio as never, 0);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          const startAt = Math.max(playhead, ctx.currentTime + 0.02);
          src.start(startAt);
          playhead = startAt + buf.duration;
          lastEnd = playhead;
          sources.push(src);
        }
        if (!stopped && ctx) {
          // Let the tail of the scheduled audio finish.
          const remaining = Math.max(0, lastEnd - ctx.currentTime);
          await new Promise<void>((resolve) => setTimeout(resolve, Math.ceil(remaining * 1000) + 50));
        }
        return;
      }

      // One-shot fallback (no stream support in the loaded bundle).
      const out = await tts.generate(line, { voice, speed });
      if (stopped || !out?.audio?.length) return;
      ctx = makeCtx();
      const buf = ctx.createBuffer(1, out.audio.length, out.sampling_rate);
      buf.copyToChannel(out.audio as never, 0);
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      sources.push(source);
      await new Promise<void>((resolve) => {
        if (stopped) return resolve();
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
      for (const s of sources) {
        try { s.stop(); } catch { /* not started */ }
      }
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
