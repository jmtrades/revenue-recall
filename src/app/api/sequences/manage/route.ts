import { NextResponse } from "next/server";
import { z } from "zod";
import { createCustomSequence, updateCustomSequence, deleteCustomSequence } from "@/lib/sequences-store";
import { listEnrollments, stopEnrollment } from "@/lib/cadence";
import { requireRole } from "@/lib/authz";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const Step = z.object({
  day: z.number().int().min(0).max(90),
  channel: z.enum(["call", "email", "sms"]),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(2000),
});

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  goal: z.string().trim().max(300).optional(),
  steps: z.array(Step).min(1).max(12),
});

const PatchBody = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().trim().min(1).max(80).optional(),
    goal: z.string().trim().max(300).optional(),
    steps: z.array(Step).min(1).max(12).optional(),
  })
  .refine((d) => d.name !== undefined || d.goal !== undefined || d.steps !== undefined, { message: "Provide a field to update" });

const DeleteBody = z.object({ id: z.string().min(1).max(200) });

function dbUnavailable(e: unknown) {
  const msg = e instanceof Error ? e.message : "Failed";
  return /require a database|No active org/.test(msg)
    ? NextResponse.json({ error: "Custom sequences need a connected database." }, { status: 409 })
    : NextResponse.json({ error: msg }, { status: 409 });
}

/** Create an org sequence. Owner/admin; org-scoped by the store. */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "sequence-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A sequence needs a name and 1–12 valid steps." }, { status: 400 });
  try {
    const sequence = await createCustomSequence(parsed.data);
    return NextResponse.json({ ok: true, sequence }, { status: 201 });
  } catch (e) {
    return dbUnavailable(e);
  }
});

export const PATCH = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "sequence-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid sequence update" }, { status: 400 });
  const { id, ...patch } = parsed.data;
  try {
    await updateCustomSequence(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbUnavailable(e);
  }
});

export const DELETE = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "sequence-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    // Stop active enrollments first so the metrics read "stopped", not a
    // mysterious "completed" when the runtime can no longer find the sequence.
    const active = await listEnrollments("active").catch(() => []);
    for (const e of active.filter((x) => x.sequenceId === parsed.data.id)) {
      await stopEnrollment(e.id).catch(() => {});
    }
    await deleteCustomSequence(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbUnavailable(e);
  }
});
