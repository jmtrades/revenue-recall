import { NextResponse } from "next/server";
import { getTask } from "@/lib/agent/store";
import { runTask } from "@/lib/agent/engine";
import { autopilotLockKey } from "@/lib/agent/lock";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { requireRole } from "@/lib/authz";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = withGuard(async (_req: Request, { params }: { params: { id: string } }) => {
  // Triggering an org-wide Autopilot run (it can auto-send) is an admin action.
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const task = await getTask(params.id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  // Hold the same per-org Autopilot lock as the cron, so a manual "run now" can't
  // race a scheduled tick and double-send to the same prospects.
  const lockKey = await autopilotLockKey();
  const fence = await acquireCronLock(lockKey);
  if (!fence) return NextResponse.json({ error: "Autopilot is already running — try again in a moment." }, { status: 409 });
  try {
    const run = await runTask(task);
    return NextResponse.json({ run });
  } finally {
    await releaseCronLock(lockKey, fence);
  }
});
