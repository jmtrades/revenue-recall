/**
 * Shared ElevenLabs SDK client (official @elevenlabs/elevenlabs-js).
 *
 * The TTS, voice-library, cloning, and Conversational-AI paths all talk to
 * ElevenLabs through this one memoized client instead of hand-rolled fetches, so
 * we ride the SDK's request signing, retries, and typed models — and pick up new
 * models/voices automatically. One client per API key (rebuilt only if the key
 * changes), plus a single error formatter so an SDK failure still surfaces the
 * provider's ACTUAL reason (invalid_api_key, voice_not_found, quota exceeded)
 * the way the raw-fetch paths did.
 *
 * Inert until ELEVENLABS_API_KEY is set: elevenClient() returns null and every
 * caller already gates on that (elevenConfigured() / ttsProvider()).
 */
import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";

let cached: { key: string; client: ElevenLabsClient } | null = null;

/** The shared SDK client, or null when no key is configured. Memoized per key. */
export function elevenClient(): ElevenLabsClient | null {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || key.length === 0) return null;
  if (cached && cached.key === key) return cached.client;
  const client = new ElevenLabsClient({ apiKey: key });
  cached = { key, client };
  return client;
}

/** Format an SDK error into the "<prefix> <status>: <body>" shape the raw-fetch
 *  paths used, so a failure stays one-glance diagnosable. Body is truncated like
 *  before; falls back to the message when the SDK didn't attach a body. */
export function elevenSdkError(prefix: string, e: unknown): string {
  if (e instanceof ElevenLabsError) {
    const status = typeof e.statusCode === "number" ? ` ${e.statusCode}` : "";
    const body =
      e.body !== undefined && e.body !== null
        ? `: ${(typeof e.body === "string" ? e.body : JSON.stringify(e.body)).slice(0, 200)}`
        : e.message
          ? `: ${e.message}`
          : "";
    return `${prefix}${status}${body}`;
  }
  return `${prefix}: ${e instanceof Error ? e.message : String(e)}`;
}

/** The HTTP status behind an SDK error, or undefined when it isn't one (network
 *  failure, abort). Lets callers distinguish "this model isn't usable" (try the
 *  next one) from a transient/auth error. */
export function elevenErrorStatus(e: unknown): number | undefined {
  return e instanceof ElevenLabsError && typeof e.statusCode === "number" ? e.statusCode : undefined;
}

/** Collect a byte ReadableStream (what textToSpeech.convert resolves to) into a
 *  single ArrayBuffer for a Response body. Uses a reader rather than async
 *  iteration, which isn't guaranteed on every ReadableStream implementation. */
export async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out.buffer as ArrayBuffer;
}
