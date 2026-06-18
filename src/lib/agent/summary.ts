import type { AgentRun } from "./types";

export interface RunsSummary {
  /** Total actions taken across the runs (every touch, including skips). */
  actionsTaken: number;
  /** Distinct deals the autopilot actually worked, deduped by deal id. A deal
   *  touched across several runs counts once — summing per-run item counts
   *  inflates this past the real deal count and reads as a contradiction with
   *  the recall queue's "deals worked". */
  dealsWorked: number;
  /** Recoverable value of those distinct worked deals, counted once each. */
  recoverableTouched: number;
}

/**
 * Roll up the recent run ledger into the autopilot summary stats. Deduped by
 * deal so the numbers can't contradict the recall queue by double-counting a
 * deal touched in multiple runs. Skipped touches (opted-out, quiet-hours, …)
 * are evaluations, not work, so they don't count toward "worked". Pure +
 * testable — see tests/agent-runs-summary.test.ts.
 */
export function summarizeRuns(runs: AgentRun[]): RunsSummary {
  let actionsTaken = 0;
  // Value per distinct worked deal — counted once even across multiple runs.
  const valueByDeal = new Map<string, number>();
  for (const run of runs) {
    actionsTaken += run.actions.length;
    for (const a of run.actions) {
      if (a.result === "skipped" || !a.dealId) continue;
      valueByDeal.set(a.dealId, Math.max(valueByDeal.get(a.dealId) ?? 0, a.value ?? 0));
    }
  }
  let recoverableTouched = 0;
  for (const v of valueByDeal.values()) recoverableTouched += v;
  return { actionsTaken, dealsWorked: valueByDeal.size, recoverableTouched };
}
