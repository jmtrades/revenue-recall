import { NextResponse } from "next/server";
import { isAiConfigured } from "@/lib/ai/client";
import { consumeAiAction } from "@/lib/billing/usage";

/**
 * Meter one AI action before a route makes a paid model call. Returns a 402
 * response when the org is out of included actions and credits; returns null
 * to proceed. No-ops when AI isn't configured (template fallbacks are free).
 */
export async function gateAiAction(): Promise<NextResponse | null> {
  if (!isAiConfigured()) return null;
  const result = await consumeAiAction();
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "You're out of AI actions this month. Upgrade your plan or top up credits in Settings → Billing.",
        code: "ai_quota",
      },
      { status: 402 },
    );
  }
  return null;
}
