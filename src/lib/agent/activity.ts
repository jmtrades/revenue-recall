import type { AgentRun, AgentAction } from "@/lib/agent/types";

/**
 * Flatten the autopilot run ledger into a plain, newest-first activity feed —
 * "what the agent is actually doing": who it called/texted/emailed, the outcome,
 * and when. Each run records its actions; this unrolls them across runs so the
 * UI can show one honest timeline instead of a pile of run objects. Pure + tested.
 */
export interface AgentActivityItem {
  type: AgentAction["type"]; // call | sms | email | recommend
  title: string;
  detail: string;
  result: AgentAction["result"]; // sent | logged | drafted | queued | skipped
  at: string;
}

export function recentAgentActivity(runs: AgentRun[], limit = 12): AgentActivityItem[] {
  const items: AgentActivityItem[] = [];
  for (const run of runs) {
    const at = run.finishedAt ?? run.startedAt;
    for (const a of run.actions) {
      items.push({ type: a.type, title: a.title, detail: a.detail, result: a.result, at });
    }
  }
  // Stable on equal timestamps (two actions in one run): keep run + action order.
  items.sort((x, y) => (x.at === y.at ? 0 : x.at < y.at ? 1 : -1));
  return items.slice(0, limit);
}

/** Human label for what happened — so a result reads as an action, not a status code. */
export function resultLabel(type: AgentAction["type"], result: AgentAction["result"]): string {
  if (result === "queued") return "Queued for your approval";
  if (result === "skipped") return "Skipped";
  if (result === "drafted") return "Draft ready";
  const verb = type === "call" ? "Called" : type === "sms" ? "Texted" : type === "email" ? "Emailed" : "Actioned";
  return result === "logged" ? `${verb} (logged)` : verb;
}
