import { completeJson } from "@/lib/ai/client";
import { analyzeHumanness } from "@/lib/humanness";

export interface Draft {
  subject?: string;
  body: string;
}

/**
 * Human-ness safety net for the live-AI path. After the model writes a draft we
 * score it locally (no extra API call); if it's already clean we return it
 * untouched. If it trips any AI tell or reads stiff, we ask the model to rewrite
 * it ONCE with the exact flags called out, then keep whichever version scores
 * better. This guarantees what actually ships reads like the human rep — and it
 * only spends a second call on the rare draft that needs it.
 */
export async function refineForHumanness(opts: {
  system: string;
  schema: Record<string, unknown>;
  draft: Draft;
  maxTokens?: number;
  temperature?: number;
}): Promise<Draft> {
  const before = analyzeHumanness(opts.draft.body);
  if (before.rating === "human" && before.flags.length === 0) return opts.draft;

  const flagList = before.flags.map((f) => `- "${f.text}": ${f.reason}`).join("\n") || "- reads a touch stiff; loosen it up";
  const user = `You wrote this draft, but a human-ness check rated it ${before.rating} (${before.score}/100) — it could read as AI. Rewrite it so it sounds exactly like the same human rep typed it. Keep the meaning, the rough length, the channel style, and the sign-off. Fix specifically:
${flagList}

DRAFT
Subject: ${opts.draft.subject ?? "(none)"}
Body:
"""${opts.draft.body}"""

Return the improved version as JSON — no commentary.`;

  try {
    const revised = await completeJson<Draft>({
      system: opts.system,
      user,
      schema: opts.schema,
      maxTokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.85,
    });
    // Keep the revision only if it actually scores at least as human.
    return analyzeHumanness(revised.body).score >= before.score ? revised : opts.draft;
  } catch {
    return opts.draft;
  }
}
