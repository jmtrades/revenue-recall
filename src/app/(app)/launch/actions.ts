"use server";

import { revalidatePath } from "next/cache";
import { hasRole } from "@/lib/authz";
import { isAuthRequired } from "@/lib/config";
import { listTasks, createTask, updateTask } from "@/lib/agent/store";
import { planDefaultAutopilot } from "@/lib/launch/autopilot-default";

export interface TurnOnResult {
  ok: boolean;
  error?: string;
  /** True when it created/enabled a task; false when one was already running. */
  changed?: boolean;
}

/**
 * One-click "go live": ensure there's an enabled, autonomous task that calls the
 * recall queue. Idempotent — if an enabled auto call task already exists it's a
 * no-op; if a matching task exists but is disabled it's re-enabled; otherwise a
 * sensible default is created. The engine still honors every guardrail (consent,
 * entitlement, sending pause, quiet hours), so this never bypasses safety — it
 * just removes the "where do I even start" step. Owner/admin only.
 */
export async function turnOnAutopilotAction(): Promise<TurnOnResult> {
  if (isAuthRequired() && !(await hasRole("owner", "admin"))) {
    return { ok: false, error: "Only an owner or admin can turn on autopilot." };
  }
  try {
    const plan = planDefaultAutopilot(await listTasks());
    if (plan.kind === "noop") return { ok: true, changed: false }; // already live
    if (plan.kind === "enable") {
      await updateTask(plan.id, { enabled: true });
    } else {
      await createTask({
        name: "Call the recall queue",
        goal: "Call cold and stalled leads from the recall queue to re-engage them and book a follow-up. Be warm and human, respect the prospect's time, and never pressure.",
        trigger: "daily",
        scope: "recall_queue",
        channel: "call",
        autonomy: "auto",
      });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't turn on autopilot — try again." };
  }
  for (const p of ["/launch", "/agents", "/dashboard"]) revalidatePath(p);
  return { ok: true, changed: true };
}
