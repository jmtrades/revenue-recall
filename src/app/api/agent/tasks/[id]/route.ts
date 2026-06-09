import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";
import { deleteTask, updateTask } from "@/lib/agent/store";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

const Patch = z.object({ enabled: z.boolean() });

/** Pause/resume an Autopilot agent (owner/admin) — stop it without deleting it. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await updateTask(params.id, { enabled: parsed.data.enabled });
    await recordAudit(parsed.data.enabled ? "agent.task_resumed" : "agent.task_paused", params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  try {
    await deleteTask(params.id);
    await recordAudit("agent.task_deleted", params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
