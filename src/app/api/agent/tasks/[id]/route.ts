import { NextResponse } from "next/server";
import { deleteTask } from "@/lib/agent/store";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  try {
    await deleteTask(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
