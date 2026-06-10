import { cache } from "@/lib/cache";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { isEntitled } from "@/lib/billing/enforce";
import { listMeetingTypes } from "@/lib/meetings/store";
import { hostedBookingUrl } from "@/lib/meetings/token";

export interface Voice {
  senderName?: string;
  role?: string;
  signature?: string;
  profile?: string;
  samples?: string;
  /** What the business actually does — its offer and who it serves. Grounds every
   *  AI message in THIS business, so output tailors to any vertical (or none). */
  business?: string;
  /** Workspace's own go-to next-step lines; override the industry defaults. */
  customNextSteps?: string[];
  /** Workspace's own re-engagement openers; override the industry defaults. */
  customReengage?: string[];
  /** Booking/scheduling link (Calendly, Cal.com, …). When set, the AI offers it
   *  so prospects can self-schedule — turning a warm reply into a booked call. */
  bookingUrl?: string;
}

/** Split a newline/textarea blob into clean, non-empty lines. */
function lines(raw?: string | null): string[] {
  return (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** The raw stored persona for this org, exactly as the rep saved it. Use this for
 *  EDITING and data export — never apply derived defaults here, or the editor
 *  would show (and re-save) a value the user didn't set. Request-cached. */
export const getStoredVoice = cache(async (): Promise<Voice> => {
  if (!isSupabaseConfigured()) return {};
  const client = getSupabase()!;
  const orgId = await resolveActiveOrgId();
  if (!orgId) return {};
  const { data } = await client.from("personas").select("*").eq("org_id", orgId).maybeSingle();
  if (!data) return {};
  return {
    senderName: data.sender_name ?? undefined,
    role: data.role ?? undefined,
    signature: data.signature ?? undefined,
    profile: data.profile ?? undefined,
    samples: data.samples ?? undefined,
    business: data.business ?? undefined,
    customNextSteps: lines(data.custom_next_steps),
    customReengage: lines(data.custom_reengage),
    bookingUrl: data.booking_url ?? undefined,
  };
});

/**
 * Pick the booking link to OFFER in outreach. An explicit custom link (e.g. the
 * rep's own Calendly) always wins; otherwise fall back to this org's native
 * booking page, but only once they've turned scheduling on (≥1 enabled meeting
 * type) — so the AI never starts offering a link an org didn't opt into.
 */
export function resolveBookingUrl(explicit: string | undefined, nativeUrl: string | null, bookingEnabled: boolean): string | undefined {
  if (explicit) return explicit;
  if (bookingEnabled && nativeUrl) return nativeUrl;
  return undefined;
}

/** The EFFECTIVE writing voice that composes outreach (drives how every message
 *  sounds). Same as the stored persona, except the booking link falls back to
 *  the org's native booking page per resolveBookingUrl. Request-cached. */
export const getActiveVoice = cache(async (): Promise<Voice> => {
  const stored = await getStoredVoice();
  if (!isSupabaseConfigured()) return stored;
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return stored;
  const bookingEnabled = (await listMeetingTypes({ enabledOnly: true }).catch(() => [])).length > 0;
  const bookingUrl = resolveBookingUrl(stored.bookingUrl, hostedBookingUrl(orgId), bookingEnabled);
  return { ...stored, bookingUrl };
});

const DISTILL_SYSTEM = `You analyze a salesperson's own words (a self-description and/or example messages) and produce a concise, actionable VOICE PROFILE another writer can follow to sound EXACTLY like this person — like a human, never like an AI.
Capture: tone & warmth, formality, typical sentence length & rhythm, how they greet, how they sign off, signature words/phrases/quirks, emoji usage, punctuation habits, and what they never do.
Write 5-9 short bullet points. Be specific and imitable. Do NOT repeat the samples verbatim. Return only the JSON.`;

const SCHEMA = { type: "object", additionalProperties: false, properties: { profile: { type: "string" } }, required: ["profile"] };

async function distill(input: { senderName?: string; role?: string; samples: string }): Promise<string> {
  // Live AI is a paid entitlement — without it the raw samples ARE the profile.
  if (!isAiConfigured() || !input.samples.trim() || !(await isEntitled("aiLive"))) return input.samples.trim();
  try {
    const out = await completeJson<{ profile: string }>({
      system: DISTILL_SYSTEM,
      user: `Name: ${input.senderName ?? "(unknown)"}\nRole: ${input.role ?? "(unknown)"}\nTheir words (self-description and/or example messages):\n"""${input.samples}"""\n\nProduce the voice profile now.`,
      schema: SCHEMA,
      maxTokens: 800,
      think: true,
      effort: "high", // careful analysis of the rep's writing voice
      feature: "voice",
    });
    return out.profile;
  } catch {
    return input.samples.trim();
  }
}

export async function learnVoice(input: {
  senderName?: string;
  role?: string;
  signature?: string;
  samples?: string;
  business?: string;
  customNextSteps?: string;
  customReengage?: string;
  bookingUrl?: string;
}): Promise<Voice & { aiDistilled: boolean }> {
  const samples = input.samples?.trim() ?? "";
  const client = isSupabaseConfigured() ? getSupabase() : null;
  const orgId = client ? await resolveActiveOrgId() : null;

  // Re-distill the profile only when new samples are given; otherwise preserve
  // the existing one so a rep can tweak just their playbook lines.
  let profile = samples;
  if (samples) {
    profile = await distill({ senderName: input.senderName, role: input.role, samples });
  } else if (client && orgId) {
    const { data } = await client.from("personas").select("profile,samples").eq("org_id", orgId).maybeSingle();
    profile = (data?.profile as string) ?? "";
  }
  const aiDistilled = isAiConfigured() && Boolean(samples) && profile !== samples;

  if (client && orgId) {
    const row: Record<string, unknown> = {
      org_id: orgId,
      sender_name: input.senderName ?? null,
      role: input.role ?? null,
      signature: input.signature ?? null,
      profile,
      custom_next_steps: input.customNextSteps ?? null,
      custom_reengage: input.customReengage ?? null,
      updated_at: new Date().toISOString(),
    };
    if (samples) row.samples = samples; // don't wipe samples when only tuning the playbook
    // Only touch `business` when explicitly provided, so editing just the voice
    // never erases the workspace's business description (and vice-versa).
    if (input.business !== undefined) row.business = input.business.trim() || null;
    // Same guard for the booking link: only touch it when explicitly provided.
    if (input.bookingUrl !== undefined) row.booking_url = input.bookingUrl.trim() || null;
    const { error } = await client.from("personas").upsert(row, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
  }

  return {
    senderName: input.senderName,
    role: input.role,
    signature: input.signature,
    samples,
    profile,
    business: input.business?.trim() || undefined,
    customNextSteps: lines(input.customNextSteps),
    customReengage: lines(input.customReengage),
    bookingUrl: input.bookingUrl?.trim() || undefined,
    aiDistilled,
  };
}
