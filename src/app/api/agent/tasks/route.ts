import { NextResponse } from "next/server";
import { z } from "zod";
import { createTask, listTasks } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ tasks: await listTasks() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

const Body = z.object({
  name: z.string().min(1).max(120),
  goal: z.string().min(1).max(2000),
  trigger: z.enum(["manual", "daily", "on_new_lead", "on_idle_deal"]).optional(),
  scope: z.string().max(120).optional(),
  channel: z.enum(["email", "sms", "call", "none"]).optional(),
  autonomy: z.enum(["review", "auto"]).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid task" }, { status: 400 });
  try {
    return NextResponse.json({ task: await createTask(parsed.data) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
