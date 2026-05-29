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
interface SpeechRecognitionResultListLike {
  length: number;
  [i: number]: SpeechRecognitionResultLike & { isFinal: boolean };
}
interface SpeechRecognitionStreamEvent {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onspeechstart?: (() => void) | null;
  onend?: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (!isRecognitionSupported()) return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** How a line is delivered emotionally — shifts speed, pitch, and pause length
 *  the way a person's voice changes with the moment. */
export type Emotion = "neutral" | "warm" | "calm" | "energetic" | "empathetic" | "confident";

interface EmotionProfile {
  rateMul: number;
  pitchMul: number;
  pauseMul: number;
}

export const EMOTIONS: Record<Emotion, EmotionProfile> = {
  neutral: { rateMul: 1, pitchMul: 1, pauseMul: 1 },
  warm: { rateMul: 0.98, pitchMul: 1.01, pauseMul: 1.08 },
  calm: { rateMul: 0.9, pitchMul: 0.97, pauseMul: 1.3 },
  energetic: { rateMul: 1.1, pitchMul: 1.06, pauseMul: 0.85 },
  empathetic: { rateMul: 0.88, pitchMul: 0.96, pauseMul: 1.35 },
  confident: { rateMul: 1.02, pitchMul: 0.98, pauseMul: 0.95 },
};

export function emotionProfile(e?: Emotion): EmotionProfile {
  return EMOTIONS[e ?? "neutral"];
}

export interface VoicePrefs {
  /** Prefer a specific voice name (substring match), else best-guess natural. */
  preferName?: string;
  lang?: string;
  /** 0.1–10; ~1 is natural speaking speed. */
  rate?: number;
  /** 0–2; ~1 is natural pitch. */
  pitch?: number;
  /** Emotional delivery applied on top of base rate/pitch. */
  emotion?: Emotion;
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

const DAYS: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

/**
 * Normalize text so a synth reads it like a person, not a symbol-reader: voice
 * money/large numbers/times the way they're spoken, turn dashes into natural
 * pauses, expand the abbreviations people skim past in writing but would say in
 * full ("15 min" → "15 minutes", "e.g." → "for example"), voice symbols (& %),
 * and strip bullets/markdown. Pure and tested.
 */
const SCALE: Record<string, string> = { k: "thousand", m: "million", b: "billion" };
const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** Speak a run of digits one-by-one ("4567" → "four five six seven"). */
function sayDigits(d: string): string {
  return d.replace(/\D/g, "").split("").map((c) => DIGIT_WORDS[Number(c)]).join(" ");
}

export function speakable(text: string): string {
  let s = text;
  s = s.replace(/[•*]|^[\s]*[-–]\s+/gm, " "); // bullets / markdown leaders
  s = s.replace(/\s*[—–]\s*/g, ", "); // dashes → spoken pause

  // Money: "$2.5M" → "2.5 million dollars"; "$1,200" → "1200 dollars".
  s = s.replace(/\$\s?([\d,]+(?:\.\d+)?)\s*([kmb])\b/gi, (_m, n: string, scale: string) => `${n.replace(/,/g, "")} ${SCALE[scale.toLowerCase()]} dollars`);
  s = s.replace(/\$\s?([\d,]+(?:\.\d+)?)/g, (_m, n: string) => `${n.replace(/,/g, "")} dollars`);
  // Times: "2pm"/"2:30 p.m." → "2 PM"/"2:30 PM" (synths read the spelled form better).
  s = s.replace(/\b(\d{1,2})(:\d{2})?\s*([ap])\.?m\.?\b/gi, (_m, h: string, min: string | undefined, ap: string) => `${h}${min ?? ""} ${ap.toLowerCase() === "a" ? "AM" : "PM"}`);

  // Phone numbers → grouped, spoken digits so a callback number isn't read as one
  // giant integer. Matched only on phone-SHAPED tokens (separators or a leading +),
  // so plain large numbers (money, already voiced above) are left intact.
  s = s.replace(/(?:\+(\d{1,3})[\s.-]?)?\(?\b(\d{3})\)?[\s.-](\d{3})[\s.-](\d{4})\b/g, (_m, cc: string | undefined, a: string, b: string, c: string) => `${cc ? `${sayDigits(cc)}, ` : ""}${sayDigits(a)}, ${sayDigits(b)}, ${sayDigits(c)}`);
  s = s.replace(/\+(\d[\d\s.-]{8,16}\d)/g, (_m, d: string) => sayDigits(d));
  // Emails: speak "@" and "." inside the address ("sales@acme.com" → "sales at acme dot com").
  s = s.replace(/\b([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)\b/g, (_m, user: string, host: string) => {
    const say = (p: string) => p.replace(/\./g, " dot ").replace(/[_+-]/g, " ").replace(/\s{2,}/g, " ").trim();
    return `${say(user)} at ${say(host)}`;
  });

  s = s.replace(/#(?=\d)/g, "number "); // "#3" → "number 3"
  s = s.replace(/\betc\.?/gi, "and so on");
  s = s.replace(/\s*&\s*/g, " and ");
  s = s.replace(/(\d)\s*%/g, "$1 percent").replace(/%/g, " percent");
  s = s.replace(/\bw\//gi, "with ");
  s = s.replace(/\be\.g\.\s*/gi, "for example, ");
  s = s.replace(/\bi\.e\.\s*/gi, "that is, ");
  s = s.replace(/\bASAP\b/g, "as soon as possible");
  s = s.replace(/\bapprox\.?\b/gi, "approximately");
  s = s.replace(/\bvs\.?\b/gi, "versus");
  // Units only when they follow a number, so we don't mangle real words.
  s = s.replace(/(\d+)\s*mins?\b/gi, (_m, n) => `${n} ${n === "1" ? "minute" : "minutes"}`);
  s = s.replace(/(\d+)\s*hrs?\b/gi, (_m, n) => `${n} ${n === "1" ? "hour" : "hours"}`);
  // Day abbreviations as whole words.
  s = s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, (m) => DAYS[m] ?? m);
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  return s;
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
  // Fold the emotional profile into base rate/pitch, then scale pauses by it, so
  // the same line sounds calm-and-slow or upbeat-and-quick as the moment calls for.
  const emo = emotionProfile(prefs.emotion);
  const baseRate = (prefs.rate ?? 1) * emo.rateMul;
  const basePitch = (prefs.pitch ?? 1) * emo.pitchMul;
  const chunks = humanizeChunks(speakable(text), { rate: baseRate, pitch: basePitch }).map((c) => ({
    ...c,
    pauseAfterMs: Math.round(c.pauseAfterMs * emo.pauseMul),
  }));
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
  const Rec = recognitionCtor()!;
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

export interface ContinuousOptions {
  lang?: string;
  /** Fires the moment the person starts talking (used for barge-in). */
  onSpeechStart?: () => void;
  /** Live partial transcript as they speak. */
  onInterim?: (text: string) => void;
  /** A completed utterance. */
  onFinal: (text: string) => void;
  onError?: (e: string) => void;
}

/**
 * Continuously listen for a hands-free call: streams interim text, signals when
 * speech starts (so the speaker can yield the floor — barge-in), and emits each
 * finished utterance. Auto-restarts if the engine ends on its own. Client-only.
 */
export function listenContinuous(opts: ContinuousOptions): ListenHandle {
  const Rec = recognitionCtor();
  if (!Rec) {
    opts.onError?.("speech recognition not supported");
    return { stop: () => {} };
  }
  const rec = new Rec();
  rec.lang = opts.lang ?? "en-US";
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = true;
  let stopped = false;

  rec.onspeechstart = () => opts.onSpeechStart?.();
  rec.onresult = (e) => {
    const ev = e as unknown as SpeechRecognitionStreamEvent;
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      const text = (r?.[0]?.transcript ?? "").trim();
      if (!text) continue;
      if (r.isFinal) opts.onFinal(text);
      else interim += ` ${text}`;
    }
    if (interim.trim()) opts.onInterim?.(interim.trim());
  };
  rec.onerror = (e) => opts.onError?.(e.error ?? "recognition error");
  rec.onend = () => {
    if (!stopped) {
      try {
        rec.start(); // keep the floor open across the engine's auto-stops
      } catch {
        /* ignore */
      }
    }
  };
  try {
    rec.start();
  } catch {
    /* already started */
  }
  return {
    stop: () => {
      stopped = true;
      rec.stop();
    },
  };
}
