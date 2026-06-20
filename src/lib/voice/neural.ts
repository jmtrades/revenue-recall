/**
 * ElevenLabs voice backend — the ONLY speech engine (voice is ElevenLabs-only).
 *
 * It implements the same `VoiceSynth` contract the seam expects by calling the
 * server-side `/api/voice/tts` route, which holds the ElevenLabs key and spends
 * the provider money — the client never sees the key. Registered via
 * enableNeuralVoice() so getSynth() returns it whenever ElevenLabs is configured
 * and the workspace is entitled. There is no on-device (Kokoro), self-hosted
 * streaming, or browser-TTS fallback any more: if ElevenLabs isn't available the
 * synth reports available() === false and callers degrade to silence.
 */

import { type SpeakHandle } from "@/lib/voice/speech";
import { type VoiceSynth, type SpeakOptions, setSynth } from "@/lib/voice/synth";

/** Whether a failed /api/voice/tts response should DISABLE the hosted voice for
 *  the session. Only config/entitlement failures (key revoked, plan downgraded,
 *  route off) are permanent; a transient 429/5xx must not — the next read-aloud
 *  retries ElevenLabs. Pure + tested. */
export function hostedDisableOnStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 503;
}

let hostedState: "unknown" | "yes" | "no" = "unknown";
// The org's saved speaking speed, learned from the probe — applied at playback
// for ElevenLabs (which ignores server-side rate) so the tuned speed is audible
// on every read-aloud.
let hostedRate = 1;

function probeHosted(): void {
  if (typeof window === "undefined" || hostedState !== "unknown") return;
  fetch("/api/voice/tts")
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((j: { available?: boolean; rate?: number }) => {
      hostedState = j?.available ? "yes" : "no";
      if (typeof j?.rate === "number" && j.rate > 0) hostedRate = j.rate;
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
      // Only send fields the caller explicitly set, so the server can fill the
      // rest from the org's saved voice (chosen ElevenLabs voice + speed +
      // expressiveness). Always forcing rate:1 / a default voice here would
      // silently override the workspace's tuned voice on every read-aloud.
      const voice = opts.voiceId ?? opts.preferName;
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          ...(voice ? { voiceId: voice } : {}),
          ...(opts.emotion ? { emotion: opts.emotion } : {}),
          ...(typeof opts.rate === "number" && opts.rate !== 1 ? { rate: opts.rate } : {}),
          ...(opts.lang ? { lang: opts.lang } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Only DISABLE the hosted voice for the session on a config/entitlement
        // failure (key revoked, plan downgraded, route off). A transient 429
        // (rate limit) or 5xx must NOT permanently mark the voice unavailable for
        // the rest of the session: leave hostedState alone so the next read-aloud
        // tries ElevenLabs again. There is no browser fallback — a failed click is
        // silent (voice is ElevenLabs-only).
        if (hostedDisableOnStatus(res.status)) hostedState = "no";
        return;
      }
      // The server tells us (vendor-agnostically) whether to apply the speaking
      // rate at playback: the premium hosted voice ignores server-side rate, so
      // we apply it here — never both, or the speed compounds. OpenAI honors it
      // server-side, so we leave playback alone there.
      const applyClientRate = res.headers.get("X-RR-TTS-Client-Rate") === "1";
      const blob = await res.blob();
      if (stopped) return;
      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      if (applyClientRate) {
        const effectiveRate = typeof opts.rate === "number" && opts.rate !== 1 ? opts.rate : hostedRate;
        if (effectiveRate && effectiveRate !== 1) audio.playbackRate = Math.min(1.5, Math.max(0.5, effectiveRate));
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
  // Prefer the hosted ElevenLabs voice whenever it isn't KNOWN-unavailable — i.e.
  // during the brief "unknown" window before the async probe resolves, too — so
  // the first read-aloud after page load doesn't lose the race. Only a
  // config/entitlement failure (probe → "no") suppresses it.
  available: () => typeof window !== "undefined" && hostedState !== "no",
  async speak(text, opts = {}) {
    return hostedSpeak(text, opts);
  },
};

/**
 * Register the ElevenLabs backend so getSynth() uses it, and probe the hosted
 * route once. Safe to call unconditionally: with no ElevenLabs key configured (or
 * logged out / not entitled) the probe resolves to "no", the synth reports
 * available() === false, and callers degrade to silence rather than another voice.
 */
export function enableNeuralVoice(): void {
  setSynth(hostedSynth);
  probeHosted();
}
