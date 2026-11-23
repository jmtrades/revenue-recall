import { AGENT_TICK_MS, WEBINAR_TICK_MS } from "@/lib/free/schedule";

/**
 * In-process scheduler for a host that is not Vercel. A minute tick drains
 * webinar recovery. An hourly tick runs sequences, call retries, and the
 * digest. Both no-op while a previous run is still going.
 */

let started = false;
let webinarBusy = false;
let agentBusy = false;

export function schedulerEnabled(): boolean {
  if (process.env.FREE_SCHEDULER === "0") return false;
  if (process.env.VITEST === "true") return false;
  if (process.env.VERCEL) return false;
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  return true;
}

async function webinarTick(): Promise<void> {
  if (webinarBusy) return;
  webinarBusy = true;
  try {
    const { tickWebinarRecovery } = await import("@/lib/webinar/engine");
    await tickWebinarRecovery();
  } catch {
    /* the next minute tries again */
  } finally {
    webinarBusy = false;
  }
}

async function agentTick(): Promise<void> {
  if (agentBusy) return;
  agentBusy = true;
  try {
    const { runDueSteps } = await import("@/lib/cadence");
    const { runCallRetries } = await import("@/lib/calls");
    const { runDigests } = await import("@/lib/digest");
    const { tickWebinarRecovery } = await import("@/lib/webinar/engine");
    await runDueSteps().catch(() => null);
    await runCallRetries().catch(() => null);
    await tickWebinarRecovery().catch(() => null);
    await runDigests().catch(() => null);
  } catch {
    /* the next hour tries again */
  } finally {
    agentBusy = false;
  }
}

export function startFreeScheduler(): void {
  if (started || !schedulerEnabled()) return;
  started = true;
  const webinar = setInterval(() => void webinarTick(), WEBINAR_TICK_MS);
  const agent = setInterval(() => void agentTick(), AGENT_TICK_MS);
  webinar.unref?.();
  agent.unref?.();
}
