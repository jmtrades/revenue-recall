import { cache } from "@/lib/cache";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { completeJson, isAiConfigured, QUALITY_MODEL } from "@/lib/ai/client";

export interface Voice {
  senderName?: string;
  role?: string;
  signature?: string;
  profile?: string;
  samples?: string;
}

/** The active writing voice for this org (drives how every message sounds). */
export const getActiveVoice = cache(async (): Promise<Voice> => {
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
  };
});

const DISTILL_SYSTEM = `You are an elite ghostwriting coach. From a salesperson's own words (a self-description and/or real messages), produce a precise, imitable VOICE PROFILE that lets another writer reproduce this exact human — so faithfully no reader could tell it wasn't them. Never make them sound like an AI.

Capture concretely (with mini-examples drawn from their words where possible):
- Tone & warmth; formality level; how much personality vs. all-business.
- Sentence rhythm: short and punchy vs. flowing; average length; fragments?
- Greetings and sign-offs they actually use (verbatim patterns).
- Signature words, phrases, and verbal tics; contractions; slang.
- Capitalization and punctuation habits (lowercase? em dashes? ellipses? one-line texts?).
- Emoji usage (which, how often, where).
- How they handle asks, pushback, and saying no.
- Hard "never does" list (things that would break the illusion).

Write 6-10 tight, specific, imitable bullets. Do NOT repeat the samples verbatim — distill the pattern. Return only the JSON.`;

const SCHEMA = { type: "object", additionalProperties: false, properties: { profile: { type: "string" } }, required: ["profile"] };

async function distill(input: { senderName?: string; role?: string; samples: string }): Promise<string> {
  if (!isAiConfigured() || !input.samples.trim()) return input.samples.trim();
  try {
    const out = await completeJson<{ profile: string }>({
      system: DISTILL_SYSTEM,
      user: `Name: ${input.senderName ?? "(unknown)"}\nRole: ${input.role ?? "(unknown)"}\nTheir words (self-description and/or example messages):\n"""${input.samples}"""\n\nProduce the voice profile now.`,
      schema: SCHEMA,
      maxTokens: 800,
      model: QUALITY_MODEL,
    });
    return out.profile;
  } catch {
    return input.samples.trim();
  }
}

export async function learnVoice(input: { senderName?: string; role?: string; signature?: string; samples: string }): Promise<Voice & { aiDistilled: boolean }> {
  const profile = await distill(input);
  const aiDistilled = isAiConfigured() && Boolean(input.samples.trim()) && profile !== input.samples.trim();
  if (isSupabaseConfigured()) {
    const client = getSupabase()!;
    const orgId = await resolveActiveOrgId();
    if (orgId) {
      const { error } = await client.from("personas").upsert(
        {
          org_id: orgId,
          sender_name: input.senderName ?? null,
          role: input.role ?? null,
          signature: input.signature ?? null,
          samples: input.samples,
          profile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
      if (error) throw new Error(error.message);
    }
  }
  return { ...input, profile, aiDistilled };
}
