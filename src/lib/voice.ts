import { cache } from "@/lib/cache";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { completeJson, isAiConfigured } from "@/lib/ai/client";

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

const DISTILL_SYSTEM = `You analyze a salesperson's own words (a self-description and/or example messages) and produce a concise, actionable VOICE PROFILE another writer can follow to sound EXACTLY like this person — like a human, never like an AI.
Capture: tone & warmth, formality, typical sentence length & rhythm, how they greet, how they sign off, signature words/phrases/quirks, emoji usage, punctuation habits, and what they never do.
Write 5-9 short bullet points. Be specific and imitable. Do NOT repeat the samples verbatim. Return only the JSON.`;

const SCHEMA = { type: "object", additionalProperties: false, properties: { profile: { type: "string" } }, required: ["profile"] };

async function distill(input: { senderName?: string; role?: string; samples: string }): Promise<string> {
  if (!isAiConfigured() || !input.samples.trim()) return input.samples.trim();
  try {
    const out = await completeJson<{ profile: string }>({
      system: DISTILL_SYSTEM,
      user: `Name: ${input.senderName ?? "(unknown)"}\nRole: ${input.role ?? "(unknown)"}\nTheir words (self-description and/or example messages):\n"""${input.samples}"""\n\nProduce the voice profile now.`,
      schema: SCHEMA,
      maxTokens: 800,
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
