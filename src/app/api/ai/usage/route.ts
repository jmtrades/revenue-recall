import { NextResponse } from "next/server";
import { usageSummary, monthlyBudgetUsd, isWithinBudget } from "@/lib/ai/usage";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/** This month's AI spend, token usage, and budget status for the active org. */
export const GET = withGuard(async () => {
  const [summary, withinBudget] = await Promise.all([usageSummary(), isWithinBudget()]);
  return NextResponse.json({ ...summary, budgetUsd: monthlyBudgetUsd(), withinBudget });
});
