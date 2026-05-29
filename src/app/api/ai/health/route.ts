import { NextResponse } from "next/server";
import { completeJson, isAiConfigured, aiModel } from "@/lib/ai/client";
import { writeRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Verify the AI connection end to end: makes one tiny live completion through the
 * same path drafting uses (Opus structured-output JSON), so an operator can
 * confirm ANTHROPIC_API_KEY actually works before relying on it — the AI
 * counterpart to /api/test-send for comms providers. Costs a few hundred tokens.
 */
export async function POST(req: Request) {
  if (!writeRateLimit(req, "ai-health").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  if (!isAiConfigured()) {
    return NextResponse.json({ configured: false, model: aiModel(), note: "No ANTHROPIC_API_KEY — drafting uses high-quality templates." });
  }

  const started = Date.now();
  try {
    const out = await completeJson<{ ok: boolean }>({
      system: "You output strict JSON.",
      user: 'Return {"ok": true}.',
      schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
      maxTokens: 64,
      feature: "health",
    });
    return NextResponse.json({ configured: true, ok: out.ok === true, model: aiModel(), ms: Date.now() - started });
  } catch (e) {
    // Surface the precise reason (budget reached, refusal, auth, etc.).
    return NextResponse.json({ configured: true, ok: false, model: aiModel(), error: e instanceof Error ? e.message : "AI call failed" }, { status: 502 });
  }
}
