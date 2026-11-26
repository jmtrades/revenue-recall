export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { hydrateRemoteStore } = await import("@/lib/free/db");
  await hydrateRemoteStore().catch((err: unknown) => {
    console.error("postgres hydrate failed", err instanceof Error ? err.message : "unknown");
  });
  const { startFreeScheduler } = await import("@/lib/free/scheduler");
  startFreeScheduler();
}
