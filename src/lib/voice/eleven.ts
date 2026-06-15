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

/**
 * Read an ElevenLabs error response body (truncated) so a failure surfaces the
 * provider's ACTUAL reason — `invalid_api_key`, `voice_not_found`, quota
 * exceeded — instead of a bare status code. The difference between a one-glance
 * fix and an undiagnosable "it just doesn't work". Returns "" when there's no body.
 */
export async function elevenErrorDetail(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return body ? `: ${body.slice(0, 200)}` : "";
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

/** Assemble a "Female · American · Young" descriptor from raw attribute parts,
 *  falling back to a free-text description then the category. Shared by the
 *  account-voice (labels object) and shared-voice (flat fields) paths so the
 *  format can never drift between them. Pure. */
function formatDescriptor(rawParts: Array<string | undefined>, description?: string, category?: string): string {
  const parts = rawParts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .map((p) => p.replace(/_/g, " "));
  if (parts.length) return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" · ");
  if (description && description.trim()) return description.trim().slice(0, 80);
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : "Voice";
}

/** Build a short "Female · American · young" style descriptor from labels +
 *  category. Pure so it's unit-tested without a network call. */
export function describeVoice(raw: RawVoice): string {
  const labels = raw.labels && typeof raw.labels === "object" ? raw.labels : {};
  return formatDescriptor([labels.gender, labels.accent, labels.age, labels.use_case, labels.descriptive], raw.description, raw.category);
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
  if (!res.ok) throw new Error(`ElevenLabs voices ${res.status}${await elevenErrorDetail(res)}`);
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
  if (!res.ok) throw new Error(`ElevenLabs delete ${res.status}${await elevenErrorDetail(res)}`);
}

// ---- the full public library (shared voices) ----
// GET /v1/voices only returns the account's own voices. The entire ElevenLabs
// catalog — thousands of community + professional voices — lives behind
// GET /v1/shared-voices. A user browses it here, then "adds" one to their
// account (POST /v1/voices/add/{public_owner_id}/{voice_id}); after that it
// shows up in listElevenVoices() like any other voice and is selectable.

export interface SharedVoice {
  /** The shared voice id (used with publicOwnerId to add it). */
  id: string;
  /** The owner's public user id — required to add the voice. */
  publicOwnerId: string;
  name: string;
  /** Short "Female · American · young" descriptor from the flat shared fields. */
  description: string;
  category: string;
  previewUrl?: string;
  /** Total uses across ElevenLabs — used to surface popular voices first. */
  usage: number;
}

interface RawSharedVoice {
  voice_id?: string;
  public_owner_id?: string;
  name?: string;
  category?: string;
  // Shared voices expose these as FLAT fields (not a labels object).
  gender?: string;
  accent?: string;
  age?: string;
  use_case?: string;
  descriptive?: string;
  language?: string;
  description?: string;
  preview_url?: string;
  cloned_by_count?: number;
  usage_character_count_1y?: number;
}

/** Build a "Female · American · young" descriptor from a shared voice's flat
 *  fields (shared voices don't nest these under `labels`). Pure + tested. */
export function describeSharedVoice(raw: RawSharedVoice): string {
  return formatDescriptor([raw.gender, raw.accent, raw.age, raw.use_case, raw.descriptive], raw.description, raw.category);
}

/** Normalize one shared voice, or null if unusable (no id/owner). Pure. */
export function normalizeSharedVoice(raw: RawSharedVoice): SharedVoice | null {
  if (!raw || typeof raw.voice_id !== "string" || !raw.voice_id) return null;
  if (typeof raw.public_owner_id !== "string" || !raw.public_owner_id) return null;
  return {
    id: raw.voice_id,
    publicOwnerId: raw.public_owner_id,
    name: (raw.name && raw.name.trim()) || "Unnamed voice",
    description: describeSharedVoice(raw),
    category: (raw.category ?? "professional").toLowerCase(),
    previewUrl: typeof raw.preview_url === "string" && raw.preview_url ? raw.preview_url : undefined,
    // Prefer character usage (even a legitimate 0), then clone count, else 0 —
    // a `|| ` chain would discard a real 0 and fall through to the other metric,
    // mixing units and skewing the most-used-first sort.
    usage:
      typeof raw.usage_character_count_1y === "number"
        ? raw.usage_character_count_1y
        : typeof raw.cloned_by_count === "number"
          ? raw.cloned_by_count
          : 0,
  };
}

/**
 * Browse the public ElevenLabs library. Optional free-text `search` and a
 * page size (clamped). Returns the most-used voices first so the best ones lead.
 * Throws when unconfigured or the provider errors — routes map that to JSON.
 */
export async function listSharedElevenVoices(opts?: { search?: string; limit?: number }): Promise<SharedVoice[]> {
  const k = key();
  if (!k) throw new Error("ElevenLabs not configured");
  const limit = Math.min(Math.max(opts?.limit ?? 60, 1), 100);
  const params = new URLSearchParams({ page_size: String(limit), featured: "false" });
  const search = opts?.search?.trim();
  if (search) params.set("search", search.slice(0, 80));
  const res = await fetch(`${API}/shared-voices?${params.toString()}`, {
    headers: { "xi-api-key": k },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ElevenLabs shared-voices ${res.status}${await elevenErrorDetail(res)}`);
  const data = (await res.json()) as { voices?: RawSharedVoice[] };
  const voices = (data.voices ?? [])
    .map(normalizeSharedVoice)
    .filter((v): v is SharedVoice => v !== null)
    .sort((a, b) => b.usage - a.usage);
  return voices;
}

/**
 * Add a public library voice to the account so it can be selected and spoken.
 * Returns the new (account-local) voice id, ready for elevenSelection().
 * Both ids are validated against the conservative charset before reaching the URL.
 */
export async function addSharedElevenVoice(
  publicOwnerId: string,
  voiceId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const k = key();
  if (!k) throw new Error("ElevenLabs not configured");
  // A public owner id is a long hex string (~64 chars) — a different namespace
  // than a 20-char voice id, so it gets a roomier bound to avoid rejecting a
  // valid owner and breaking "Add to my voices" for every library voice.
  if (!/^[A-Za-z0-9]{1,128}$/.test(publicOwnerId)) throw new Error("Invalid owner id");
  if (!/^[A-Za-z0-9]{1,64}$/.test(voiceId)) throw new Error("Invalid voice id");
  const newName = (name && name.trim()) || "Library voice";
  const res = await fetch(`${API}/voices/add/${publicOwnerId}/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": k, "Content-Type": "application/json" },
    body: JSON.stringify({ new_name: newName.slice(0, 80) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs add ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as { voice_id?: string; name?: string };
  if (!data.voice_id) throw new Error("ElevenLabs add: no voice id returned");
  return { id: data.voice_id, name: data.name || newName };
}
