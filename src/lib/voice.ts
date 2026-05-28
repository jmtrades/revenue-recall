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
  /** Workspace's own go-to next-step lines; override the industry defaults. */
  customNextSteps?: string[];
  /** Workspace's own re-engagement openers; override the industry defaults. */
  customReengage?: string[];
}

/** Split a newline/textarea blob into clean, non-empty lines. */
function lines(raw?: string | null): string[] {
  return (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
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
    customNextSteps: lines(data.custom_next_steps),
    customReengage: lines(data.custom_reengage),
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

export async function learnVoice(input: {
  senderName?: string;
  role?: string;
  signature?: string;
  samples?: string;
  customNextSteps?: string;
  customReengage?: string;
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
    const { error } = await client.from("personas").upsert(row, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
  }

  return {
    senderName: input.senderName,
    role: input.role,
    signature: input.signature,
    samples,
    profile,
    customNextSteps: lines(input.customNextSteps),
    customReengage: lines(input.customReengage),
    aiDistilled,
  };
}
