/**
 * ElevenLabs voice library + Instant Voice Cloning.
 *
 * The hosted TTS (lib/voice/tts.ts) speaks every read-aloud / preview surface,
 * and ElevenLabs is its highest-quality provider. This module is the "pick from
 * loads of voices, or clone your own" layer on top of it:
 *
 *  - listElevenVoices()  — the account's full voice library (premade catalog +
 *    professional voices + any clones the org has made), fetched live so there's
 *    no fragile hardcoded id map and new/cloned voices appear automatically.
 *  - cloneElevenVoice()  — Instant Voice Cloning: a few seconds of consented
 *    audio → a private voice the org can then speak in.
 *  - deleteElevenVoice() — remove a clone.
 *
 * A chosen voice is stored on the org as "eleven:<voiceId>" (see ELEVEN_PREFIX),
 * which providerVoice() in tts.ts resolves straight to the ElevenLabs voice.
 * Inert until ELEVENLABS_API_KEY is set — callers gate on elevenConfigured().
 */

const API = "https://api.elevenlabs.io/v1";

/** Stored-voice scheme: "eleven:<voiceId>" distinguishes an ElevenLabs voice
 *  (stock or clone) from an in-house Kokoro id. */
export const ELEVEN_PREFIX = "eleven:";

function key(): string | undefined {
  const v = process.env.ELEVENLABS_API_KEY;
  return v && v.length > 0 ? v : undefined;
}

/** True once an ElevenLabs key is configured — the whole feature self-gates on this. */
export function elevenConfigured(): boolean {
  return Boolean(key());
}

/** Wrap a raw ElevenLabs voice id as a stored org selection. */
export function elevenSelection(voiceId: string): string {
  return `${ELEVEN_PREFIX}${voiceId}`;
}

/**
 * Extract the raw ElevenLabs voice id from a stored selection, or null when the
 * value isn't an ElevenLabs selection. Pure + tested. The id charset is the
 * conservative set ElevenLabs uses (alphanumerics), bounded so a malformed value
 * can never reach the provider URL.
 */
export function parseElevenSelection(voiceId: string | null | undefined): string | null {
  if (typeof voiceId !== "string" || !voiceId.startsWith(ELEVEN_PREFIX)) return null;
  const id = voiceId.slice(ELEVEN_PREFIX.length).trim();
  return /^[A-Za-z0-9]{1,64}$/.test(id) ? id : null;
}

export interface ElevenVoice {
  id: string;
  name: string;
  /** premade | professional | cloned | generated | famous | … (provider's term). */
  category: string;
  /** Short human descriptor assembled from the provider's labels (gender/accent/age). */
  description: string;
  /** A hosted sample URL for instant preview, when the provider supplies one. */
  previewUrl?: string;
  /** True for the org's own clones — these are deletable and sorted first. */
  cloned: boolean;
}

interface RawVoice {
  voice_id?: string;
  name?: string;
  category?: string;
  description?: string;
  preview_url?: string;
  labels?: Record<string, string> | null;
}

/** Build a short "Female · American · young" style descriptor from labels +
 *  category. Pure so it's unit-tested without a network call. */
export function describeVoice(raw: RawVoice): string {
  const labels = raw.labels && typeof raw.labels === "object" ? raw.labels : {};
  const parts = [labels.gender, labels.accent, labels.age, labels.use_case, labels.descriptive]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .map((p) => p.replace(/_/g, " "));
  if (parts.length) return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" · ");
  if (raw.description && raw.description.trim()) return raw.description.trim().slice(0, 80);
  return raw.category ? raw.category.charAt(0).toUpperCase() + raw.category.slice(1) : "Voice";
}

/** Normalize one provider voice into our shape, or null if it's unusable. Pure. */
export function normalizeElevenVoice(raw: RawVoice): ElevenVoice | null {
  if (!raw || typeof raw.voice_id !== "string" || !raw.voice_id) return null;
  const category = (raw.category ?? "premade").toLowerCase();
  return {
    id: raw.voice_id,
    name: (raw.name && raw.name.trim()) || "Unnamed voice",
    category,
    description: describeVoice(raw),
    previewUrl: typeof raw.preview_url === "string" && raw.preview_url ? raw.preview_url : undefined,
    cloned: category === "cloned" || category === "generated",
  };
}

/** Sort clones first (the org's own voices), then alphabetical by name. Pure. */
export function sortVoices(voices: ElevenVoice[]): ElevenVoice[] {
  return [...voices].sort((a, b) => {
    if (a.cloned !== b.cloned) return a.cloned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** The account's full voice library (premade + professional + clones). Throws
 *  when unconfigured or the provider errors — routes map that to clean JSON. */
export async function listElevenVoices(): Promise<ElevenVoice[]> {
  const k = key();
  if (!k) throw new Error("ElevenLabs not configured");
  const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": k }, cache: "no-store" });
  if (!res.ok) throw new Error(`ElevenLabs voices ${res.status}`);
  const data = (await res.json()) as { voices?: RawVoice[] };
  const voices = (data.voices ?? [])
    .map(normalizeElevenVoice)
    .filter((v): v is ElevenVoice => v !== null);
  return sortVoices(voices);
}

export interface CloneInput {
  name: string;
  description?: string;
  /** Recorded/uploaded audio samples (one is enough for instant cloning). */
  files: File[];
}

/**
 * Instant Voice Cloning: create a private voice from a few seconds of consented
 * audio. Returns the new voice id, which can be stored via elevenSelection().
 */
export async function cloneElevenVoice(input: CloneInput): Promise<{ id: string; name: string }> {
  const k = key();
  if (!k) throw new Error("ElevenLabs not configured");
  if (!input.files.length) throw new Error("Add at least one audio sample to clone a voice.");
  const form = new FormData();
  form.append("name", input.name);
  if (input.description) form.append("description", input.description);
  for (const f of input.files) form.append("files", f, f.name || "sample.webm");
  const res = await fetch(`${API}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": k },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs clone ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as { voice_id?: string; name?: string };
  if (!data.voice_id) throw new Error("ElevenLabs clone: no voice id returned");
  return { id: data.voice_id, name: data.name || input.name };
}

/** Delete a voice (used to remove the org's own clones). */
export async function deleteElevenVoice(voiceId: string): Promise<void> {
  const k = key();
  if (!k) throw new Error("ElevenLabs not configured");
  const id = parseElevenSelection(elevenSelection(voiceId)) ?? voiceId;
  if (!/^[A-Za-z0-9]{1,64}$/.test(id)) throw new Error("Invalid voice id");
  const res = await fetch(`${API}/voices/${id}`, { method: "DELETE", headers: { "xi-api-key": k } });
  if (!res.ok) throw new Error(`ElevenLabs delete ${res.status}`);
}
