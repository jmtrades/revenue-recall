import { NextResponse } from "next/server";
import { usageSummary, monthlyBudgetUsd, isWithinBudget } from "@/lib/ai/usage";

export const dynamic = "force-dynamic";

/** This month's AI spend, token usage, and budget status for the active org. */
export async function GET() {
  const [summary, withinBudget] = await Promise.all([usageSummary(), isWithinBudget()]);
  return NextResponse.json({ ...summary, budgetUsd: monthlyBudgetUsd(), withinBudget });
}
