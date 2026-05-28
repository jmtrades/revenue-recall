/**
 * In-house voice I/O — no third-party provider, no API key, no audio leaves the
 * device. Speech synthesis (text → speech) and recognition (speech → text) both
 * run on the browser's built-in Web Speech engine, so the spoken layer is fully
 * ours to ship and control.
 *
 * The pure helpers here (voice selection + prosody chunking) are what make a
 * stock synth voice sound less robotic: we break a line into natural phrase
 * chunks and vary rate/pitch slightly per chunk, the way a person's cadence
 * drifts. They're unit-tested; the thin browser calls are guarded for SSR.
 *
 * Honest note: browser voices vary by OS and are not yet studio-grade. This is
 * the ownable, dependency-free foundation; a higher-fidelity neural voice is a
 * separate audio-model build that can slot in behind this same interface.
 */

// The Web Speech *Recognition* API is non-standard and absent from TS's DOM lib,
// so we declare the minimal surface we use. (Synthesis types are standard.)
interface SpeechRecognitionAlt { transcript: string }
interface SpeechRecognitionResultLike { 0: SpeechRecognitionAlt }
interface SpeechRecognitionResultEvent { results: { 0: SpeechRecognitionResultLike } }
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

export interface VoicePrefs {
  /** Prefer a specific voice name (substring match), else best-guess natural. */
  preferName?: string;
  lang?: string;
  /** 0.1–10; ~1 is natural speaking speed. */
  rate?: number;
  /** 0–2; ~1 is natural pitch. */
  pitch?: number;
}

export interface SpeechChunk {
  text: string;
  /** Small per-chunk rate jitter for human cadence. */
  rate: number;
  pitch: number;
  /** Pause after this chunk, ms — longer after sentence ends. */
  pauseAfterMs: number;
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isRecognitionSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
}

/**
 * Choose the most natural-sounding available voice. Prefers an explicit name,
 * then known higher-quality voice families, then any local voice in the lang,
 * then the first available. Pure given the voice list, so it's testable.
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  prefs: VoicePrefs = {},
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const lang = (prefs.lang ?? "en").toLowerCase();
  const inLang = voices.filter((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
  const pool = inLang.length ? inLang : voices;

  if (prefs.preferName) {
    const named = pool.find((v) => v.name.toLowerCase().includes(prefs.preferName!.toLowerCase()));
    if (named) return named;
  }
  // Voice families that tend to sound the most natural across platforms.
  const NATURAL = ["natural", "neural", "samantha", "aaron", "siri", "google", "premium", "enhanced"];
  for (const hint of NATURAL) {
    const match = pool.find((v) => v.name.toLowerCase().includes(hint));
    if (match) return match;
  }
  const local = pool.find((v) => v.localService);
  return local ?? pool[0];
}

/**
 * Break a line into natural phrase chunks with light, deterministic prosody
 * variation so the synth doesn't read in a flat monotone. We split on clause
 * punctuation, give a longer pause after sentence-ending marks, and nudge rate
 * and pitch a touch per chunk (seeded by length so it's stable, not random).
 */
export function humanizeChunks(text: string, base: { rate?: number; pitch?: number } = {}): SpeechChunk[] {
  const rate = base.rate ?? 1;
  const pitch = base.pitch ?? 1;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  // Split keeping the delimiter so we know whether a chunk ends a sentence.
  const parts = clean.match(/[^,;:.!?]+[,;:.!?]*/g) ?? [clean];
  return parts
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((chunk) => {
      const endsSentence = /[.!?]$/.test(chunk);
      const endsClause = /[,;:]$/.test(chunk);
      // Stable jitter from chunk length — longer phrases ride a hair slower.
      const jitter = ((chunk.length % 5) - 2) / 100; // -0.02 .. +0.02
      return {
        text: chunk,
        rate: Math.max(0.6, Math.min(1.4, rate + jitter)),
        pitch: Math.max(0.6, Math.min(1.6, pitch + jitter / 2)),
        pauseAfterMs: endsSentence ? 320 : endsClause ? 150 : 60,
      };
    });
}

/** Load voices, awaiting the async voiceschanged event the first time if needed. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener("voiceschanged", done, { once: true });
    // Safari sometimes never fires the event — fall back after a beat.
    setTimeout(() => resolve(synth.getVoices()), 500);
  });
}

export interface SpeakHandle {
  /** Resolves when the whole line has finished (or was stopped). */
  done: Promise<void>;
  stop: () => void;
}

/**
 * Speak a line with humanized cadence: each phrase chunk is its own utterance
 * with a small pause between, so it doesn't run together in a flat monotone.
 * Client-only. Returns a handle to await completion or interrupt.
 */
export function speak(text: string, prefs: VoicePrefs = {}, voice?: SpeechSynthesisVoice | null): SpeakHandle {
  if (!isSpeechSupported()) return { done: Promise.resolve(), stop: () => {} };
  const synth = window.speechSynthesis;
  synth.cancel();
  const chunks = humanizeChunks(text, { rate: prefs.rate, pitch: prefs.pitch });
  let stopped = false;
  let i = 0;

  const done = new Promise<void>((resolve) => {
    const next = () => {
      if (stopped || i >= chunks.length) return resolve();
      const c = chunks[i++];
      const u = new SpeechSynthesisUtterance(c.text);
      if (voice) u.voice = voice;
      if (prefs.lang) u.lang = prefs.lang;
      u.rate = c.rate;
      u.pitch = c.pitch;
      u.onend = () => (c.pauseAfterMs > 0 ? setTimeout(next, c.pauseAfterMs) : next());
      u.onerror = () => resolve();
      synth.speak(u);
    };
    next();
  });

  return {
    done,
    stop: () => {
      stopped = true;
      synth.cancel();
    },
  };
}

export interface ListenHandle {
  stop: () => void;
}

/**
 * Listen for one spoken phrase and return the final transcript. Client-only,
 * browser-native recognition. Calls onResult once with the best transcript.
 */
export function listenOnce(
  onResult: (transcript: string) => void,
  opts: { lang?: string; onError?: (e: string) => void } = {},
): ListenHandle {
  if (!isRecognitionSupported()) {
    opts.onError?.("speech recognition not supported");
    return { stop: () => {} };
  }
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition!;
  const rec = new Rec();
  rec.lang = opts.lang ?? "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  rec.onresult = (e) => {
    const t = e.results[0]?.[0]?.transcript ?? "";
    if (t) onResult(t.trim());
  };
  rec.onerror = (e) => opts.onError?.(e.error ?? "recognition error");
  try {
    rec.start();
  } catch {
    /* already started */
  }
  return { stop: () => rec.stop() };
}
