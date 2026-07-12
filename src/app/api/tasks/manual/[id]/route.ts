import { NextResponse } from "next/server";
import { z } from "zod";
import { setManualTaskDone, deleteManualTask } from "@/lib/tasks/manual";

export const dynamic = "force-dynamic";

const Patch = z.object({ done: z.boolean() });

/** Toggle a manual task's done state. */
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await setManualTaskDone((await params).id, parsed.data.done);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't update task" }, { status: 409 });
  }
}

/** Delete a manual task. */
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await deleteManualTask((await params).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't delete task" }, { status: 409 });
  }
}
