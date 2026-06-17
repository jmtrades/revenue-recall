import type { AgentTask } from "@/lib/agent/types";

/**
 * Decide what one-click "Turn on autopilot" should do, given the existing tasks.
 * Idempotent by design: if an enabled autonomous recall-calling task already
 * exists, do nothing; if a matching one is disabled, re-enable it; otherwise
 * create the default. Pure so the decision is testable without the store.
 */
export type AutopilotPlan = { kind: "noop" } | { kind: "enable"; id: string } | { kind: "create" };

type TaskLike = Pick<AgentTask, "id" | "channel" | "autonomy" | "scope" | "enabled">;

export function planDefaultAutopilot(tasks: TaskLike[]): AutopilotPlan {
  const matches = tasks.filter((t) => t.channel === "call" && t.autonomy === "auto" && t.scope === "recall_queue");
  if (matches.some((t) => t.enabled)) return { kind: "noop" };
  const disabled = matches.find((t) => !t.enabled);
  if (disabled) return { kind: "enable", id: disabled.id };
  return { kind: "create" };
}
