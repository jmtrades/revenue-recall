import { NextResponse } from "next/server";
import { z } from "zod";
import { enroll, listEnrollments, stopEnrollment } from "@/lib/cadence";
import { writeRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({
  sequenceId: z.string().min(1),
  // recall_queue | all_open | deal:<id> | contact:<id>
  scope: z.string().min(1).default("recall_queue"),
});

/** Enroll matching deals/contacts into a sequence (bulk by scope). */
export async function POST(req: Request) {
  if (!writeRateLimit(req, "enroll").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  try {
    const result = await enroll(parsed.data.sequenceId, parsed.data.scope);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to enroll" }, { status: 400 });
  }
}

/** Current enrollments (optionally filtered by ?status=active|completed|stopped). */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") as "active" | "completed" | "stopped" | null;
  const list = await listEnrollments(status ?? undefined);
  return NextResponse.json({ enrollments: list });
}

/** Stop an active enrollment so its remaining steps don't send (?id=<enrollmentId>). */
export async function DELETE(req: Request) {
  if (!writeRateLimit(req, "enroll").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    await stopEnrollment(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to stop" }, { status: 400 });
  }
}
