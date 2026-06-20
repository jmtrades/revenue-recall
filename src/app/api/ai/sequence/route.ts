import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { aiRateLimit } from "@/lib/ratelimit";
import { requireRole } from "@/lib/authz";
import { generateSequence } from "@/lib/ai/sequence";

export const dynamic = "force-dynamic";

const Body = z.object({ goal: z.string().max(200).optional() });

/**
 * Generate a cadence tailored to THIS org (industry playbook + what the
 * business sells + the stated goal). Returns a plan the sequence editor opens
 * pre-filled — the user reviews/edits, then saves through the normal flow.
 * Same permission bar as sequence authoring. Never 5xxs for "AI not
 * configured": the playbook-template plan answers instead.
 */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!(await aiRateLimit(req, "ai-sequence")).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const plan = await generateSequence(parsed.data.goal ?? "");
  return NextResponse.json({ plan });
});
