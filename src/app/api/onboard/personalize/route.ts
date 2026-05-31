import { NextResponse } from "next/server";
import { z } from "zod";
import { personalizeFromDescription } from "@/lib/ai/onboard";
import { aiRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ description: z.string().min(1).max(2000) });

/**
 * Conversational onboarding: a new user describes their business in plain
 * language; we return a structured profile (industry, org name, voice tone,
 * suggested goal) that pre-fills the rest of setup. AI when configured, a
 * deterministic keyword fallback otherwise — so it always personalizes.
 */
export const POST = withGuard(async (req: Request) => {
  if (!aiRateLimit(req, "onboard").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A short description is required" }, { status: 400 });

  const profile = await personalizeFromDescription(parsed.data.description);
  return NextResponse.json(profile);
});
