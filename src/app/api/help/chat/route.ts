import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { aiRateLimit } from "@/lib/ratelimit";
import { isSameOriginRequest } from "@/lib/route-access";
import { getAnthropic, aiCheapModel } from "@/lib/ai/client";
import { recordUsage, budgetFraction } from "@/lib/ai/usage";
import { costOf } from "@/lib/ai/cost";
import { HELP_SYSTEM_PROMPT, fallbackAnswer } from "@/lib/help/knowledge";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The in-product help assistant. Answers questions about how Revenue Recall
 * works, grounded in HELP_SYSTEM_PROMPT so it never invents features or numbers.
 *
 * It's a PUBLIC route by design — a prospect on the marketing site can ask it
 * questions too — so it carries no tenant data and authenticates nothing. Two
 * protections stand in for the session gate the other AI routes lean on:
 *   1. an explicit same-origin check (public routes skip the middleware's CSRF
 *      assertion), so another site can't point its users' browsers at our bot;
 *   2. the shared per-client AI rate limit, so a script can't burn the budget.
 *
 * Inert-without-config: with no ANTHROPIC_API_KEY, or once the monthly AI budget
 * is spent, it returns a curated deterministic answer instead of an error — the
 * widget keeps working, it just stops spending.
 */
const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(24),
});

function lastUserMessage(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content;
  return messages[messages.length - 1]?.content ?? "";
}

export const POST = withGuard(async (req: Request) => {
  // Same-origin defense-in-depth: the middleware exempts public /api routes from
  // its CSRF check, so assert it here ourselves.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!isSameOriginRequest(req.headers.get("origin"), req.headers.get("referer"), host)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  if (!(await aiRateLimit(req, "help-chat")).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const messages = parsed.data.messages;
  const question = lastUserMessage(messages);

  const client = getAnthropic();
  // No key, or the monthly budget is spent → curated answer, no spend, no error.
  if (!client || (await budgetFraction()) >= 1) {
    return NextResponse.json({ reply: fallbackAnswer(question), source: "guide" });
  }

  try {
    const model = aiCheapModel();
    const res = await client.messages.create({
      model,
      max_tokens: 700,
      system: HELP_SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const usage = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    const inTok = usage?.input_tokens ?? 0;
    const outTok = usage?.output_tokens ?? 0;
    void recordUsage({ model, inputTokens: inTok, outputTokens: outTok, costUsd: costOf(model, inTok, outTok), feature: "help" });
    const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const reply = block?.text?.trim();
    // Empty/refused → fall back to the curated answer rather than a blank bubble.
    return NextResponse.json(reply ? { reply, source: "ai" } : { reply: fallbackAnswer(question), source: "guide" });
  } catch {
    // Provider hiccup / over-allowance → degrade to the curated answer.
    return NextResponse.json({ reply: fallbackAnswer(question), source: "guide" });
  }
});
