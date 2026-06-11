/**
 * Neural voice backend — the drop-in higher-fidelity synth described in
 * docs/neural-voice.md §8. It implements the same `VoiceSynth` contract the
 * browser engine does, so every caller (SpeakButton, RolePlay, VoiceControls)
 * uses it automatically once it's registered and healthy — with the browser
 * engine remaining the always-available fallback via getSynth().
 *
 * IMPORTANT: this is the client-side seam, not the model. It connects to a
 * separate streaming GPU TTS service (gRPC/WebSocket) that emits raw PCM as the
 * acoustic LM produces tokens. That service is the audio-model build (§2, §6);
 * this file is what the web app talks to. Until NEXT_PUBLIC_NEURAL_VOICE_URL is
 * set it reports available() === false and the app transparently uses the
 * browser voice — so shipping this changes nothing until the service exists.
 *
 * Protocol (kept deliberately small so the serving side is easy to satisfy):
 *   • Open a WebSocket to `${NEURAL_VOICE_URL}` (wss in prod).
 *   • Send one JSON frame: { text, voiceId?, rate?, pitch?, emotion?, lang?,
 *       sampleRate, format: "pcm_s16le" }.
 *   • Receive binary frames of signed-16-bit little-endian PCM mono at
 *       `sampleRate`. A final text frame `{"type":"end"}` (or socket close)
 *       signals completion. Any `{"type":"error",...}` rejects.
 *   • Audio is scheduled gaplessly on a WebAudio clock; stop() closes the
 *       socket and cancels playback immediately (barge-in).
 */

import { speakable, type SpeakHandle } from "@/lib/voice/speech";
import { type VoiceSynth, type SpeakOptions, setSynth, browserSynth } from "@/lib/voice/synth";
import { localSynth, preloadLocalVoice } from "@/lib/voice/local";

const SAMPLE_RATE = 24_000; // 24 kHz web profile (docs §6)

function neuralUrl(): string | undefined {
  const u = process.env.NEXT_PUBLIC_NEURAL_VOICE_URL;
  return u && u.trim() ? u.trim() : undefined;
}

/** Decode signed-16-bit little-endian PCM into a Float32 AudioBuffer. */
function pcm16ToAudioBuffer(ctx: AudioContext, bytes: ArrayBuffer, sampleRate: number): AudioBuffer {
  const view = new DataView(bytes);
  const frames = Math.floor(view.byteLength / 2);
  const buf = ctx.createBuffer(1, frames || 1, sampleRate);
  const channel = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    channel[i] = view.getInt16(i * 2, true) / 0x8000; // [-1, 1)
  }
  return buf;
}

/**
 * Speak via the neural service: stream PCM over a WebSocket and play it
 * gaplessly through WebAudio, returning a SpeakHandle for await/barge-in.
 */
function neuralSpeak(text: string, opts: SpeakOptions): SpeakHandle {
  const url = neuralUrl();
  // available() gates this, but guard anyway so a direct call degrades cleanly.
  if (!url || typeof window === "undefined" || typeof WebSocket === "undefined") {
    return { done: Promise.resolve(), stop: () => {} };
  }

  const AC: typeof AudioContext =
    (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const sources: AudioBufferSourceNode[] = [];
  let playhead = ctx.currentTime + 0.05; // small lead so the first chunk schedules cleanly
  let stopped = false;
  let socket: WebSocket | null = null;

  const done = new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { ctx.close(); } catch { /* already closed */ }
      resolve();
    };

    try {
      socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";

      socket.onopen = () => {
        socket?.send(
          JSON.stringify({
            text: speakable(text),
            voiceId: opts.voiceId ?? opts.preferName,
            rate: opts.rate ?? 1,
            pitch: opts.pitch ?? 1,
            emotion: opts.emotion ?? "neutral",
            lang: opts.lang ?? "en",
            sampleRate: SAMPLE_RATE,
            format: "pcm_s16le",
          }),
        );
      };

      socket.onmessage = (ev) => {
        if (stopped) return;
        if (typeof ev.data === "string") {
          // Control frame: end / error.
          try {
            const msg = JSON.parse(ev.data) as { type?: string };
            if (msg.type === "end" || msg.type === "error") socket?.close();
          } catch { /* ignore non-JSON text frames */ }
          return;
        }
        const buffer = pcm16ToAudioBuffer(ctx, ev.data as ArrayBuffer, SAMPLE_RATE);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        // Schedule back-to-back so chunks play gaplessly even as they arrive.
        const startAt = Math.max(playhead, ctx.currentTime);
        src.start(startAt);
        playhead = startAt + buffer.duration;
        sources.push(src);
      };

      socket.onerror = finish;
      socket.onclose = () => {
        if (stopped) return finish();
        // Let any already-scheduled audio finish, then resolve.
        const remaining = Math.max(0, playhead - ctx.currentTime);
        setTimeout(finish, Math.ceil(remaining * 1000) + 60);
      };
    } catch {
      finish();
    }
  });

  function stop() {
    stopped = true;
    try { socket?.close(); } catch { /* noop */ }
    for (const s of sources) { try { s.stop(); } catch { /* already stopped */ } }
    try { ctx.close(); } catch { /* already closed */ }
  }

  return { done, stop };
}

/** The neural backend, satisfying the VoiceSynth contract. */
export const neuralSynth: VoiceSynth = {
  id: "rr-neural-v1",
  kind: "neural",
  available: () => Boolean(neuralUrl()) && typeof window !== "undefined" && typeof WebSocket !== "undefined",
  async speak(text, opts = {}) {
    return neuralSpeak(text, opts);
  },
};

// ---- hosted neural TTS (the "human voice today" path) ----
// Until the in-house streaming model exists, /api/voice/tts synthesizes with a
// hosted neural provider (ElevenLabs/OpenAI) when the operator has set a key.
// We probe availability ONCE per page load; if the route says no (no key, free
// plan, or logged out) the browser engine keeps doing its job untouched.

let hostedState: "unknown" | "yes" | "no" = "unknown";

function probeHosted(): void {
  if (typeof window === "undefined" || hostedState !== "unknown") return;
  fetch("/api/voice/tts")
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((j: { available?: boolean }) => {
      hostedState = j?.available ? "yes" : "no";
    })
    .catch(() => {
      hostedState = "no";
    });
}

function hostedSpeak(text: string, opts: SpeakOptions): SpeakHandle {
  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let stopped = false;

  const cleanup = () => {
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch { /* gone */ }
      objectUrl = null;
    }
  };

  const done = (async () => {
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voiceId: opts.voiceId ?? opts.preferName,
          emotion: opts.emotion ?? "neutral",
          rate: opts.rate ?? 1,
          lang: opts.lang,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Key revoked / plan changed mid-session: remember, and still SPEAK —
        // this call falls back to the browser engine so the user hears something.
        hostedState = "no";
        if (!stopped) await browserSynth.speak(text, opts).then((h) => h.done);
        return;
      }
      const provider = res.headers.get("X-RR-TTS-Provider");
      const blob = await res.blob();
      if (stopped) return;
      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      // OpenAI applies `rate` server-side; ElevenLabs ignores it, so apply it
      // at playback — never both, or the speed compounds.
      if (provider === "elevenlabs" && opts.rate && opts.rate !== 1) {
        audio.playbackRate = Math.min(1.5, Math.max(0.5, opts.rate));
      }
      await new Promise<void>((resolve) => {
        if (!audio) return resolve();
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } catch {
      /* aborted or network failure — resolve quietly */
    } finally {
      cleanup();
    }
  })();

  return {
    done,
    stop: () => {
      stopped = true;
      controller.abort();
      try { audio?.pause(); } catch { /* already stopped */ }
      cleanup();
    },
  };
}

export const hostedSynth: VoiceSynth = {
  id: "rr-hosted-tts",
  kind: "neural",
  available: () => typeof window !== "undefined" && hostedState === "yes",
  async speak(text, opts = {}) {
    return hostedSpeak(text, opts);
  },
};

/** One synth for getSynth(), in cost-and-quality order: the in-house streaming
 *  service when it exists, else the FREE on-device Kokoro model, else a hosted
 *  provider key, else (available()=false) the browser engine. */
const compositeSynth: VoiceSynth = {
  id: "rr-neural",
  kind: "neural",
  available: () => neuralSynth.available() || localSynth.available() || hostedSynth.available(),
  async speak(text, opts = {}) {
    if (neuralSynth.available()) return neuralSynth.speak(text, opts);
    if (localSynth.available()) return localSynth.speak(text, opts);
    return hostedSynth.speak(text, opts);
  },
};

/**
 * Register the neural backend so getSynth() prefers it when healthy, start the
 * on-device model loading in the background, and probe the hosted route once.
 * Safe to call unconditionally: with nothing configured and the local model
 * still loading (or unable to run), the composite reports available() === false
 * and every caller keeps using the browser engine.
 */
export function enableNeuralVoice(): void {
  setSynth(compositeSynth);
  preloadLocalVoice();
  probeHosted();
}
