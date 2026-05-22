import { NextResponse } from "next/server";
import { getTask } from "@/lib/agent/store";
import { runTask } from "@/lib/agent/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const task = await getTask(params.id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const run = await runTask(task);
  return NextResponse.json({ run });
}
