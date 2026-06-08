import { NextResponse } from "next/server";
import { z } from "zod";
import { createManualTask } from "@/lib/tasks/manual";
import { writeRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().min(1).max(200),
  // Date (YYYY-MM-DD) or full ISO; stored as timestamptz. Optional.
  dueAt: z.string().min(1).max(40).optional(),
});

/** Create a manual task. Session-gated by middleware; org-scoped in the lib. */
export async function POST(req: Request) {
  if (!writeRateLimit(req, "manual-tasks").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A task needs a title." }, { status: 400 });
  try {
    const task = await createManualTask(parsed.data.title, parsed.data.dueAt ?? null);
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't add task" }, { status: 409 });
  }
}
