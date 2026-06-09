import { NextResponse } from "next/server";
import { z } from "zod";
import { updateStage, moveStage, deleteStage, type StageAdminFailure } from "@/lib/stages-admin";
import { requireRole } from "@/lib/authz";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const FAILURE: Record<StageAdminFailure, { status: number; error: string }> = {
  unsupported: { status: 409, error: "Stages can't be edited here — your connected CRM owns its pipeline." },
  not_found: { status: 404, error: "Stage not found" },
  has_deals: { status: 409, error: "Move this stage's deals to another stage first." },
  last_open: { status: 409, error: "A pipeline needs at least one open stage." },
  terminal: { status: 409, error: "Won and Lost are built-in outcomes and can't be removed." },
};

function fail(reason: StageAdminFailure) {
  const f = FAILURE[reason];
  return NextResponse.json({ error: f.error }, { status: f.status });
}

const PatchBody = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    probability: z.number().min(0).max(1).optional(),
    /** Reorder: swap with the neighbor in this direction. */
    direction: z.enum(["up", "down"]).optional(),
  })
  .refine((d) => d.label !== undefined || d.probability !== undefined || d.direction !== undefined, {
    message: "Provide a field to update",
  });

/** Rename / set probability / reorder a stage. Owner/admin only. */
export const PATCH = withGuard<{ params: { id: string } }>(async (req, { params }) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "stage-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid stage update" }, { status: 400 });

  if (parsed.data.direction) {
    const moved = await moveStage(params.id, parsed.data.direction);
    if (!moved.ok) return fail(moved.reason);
  }
  if (parsed.data.label !== undefined || parsed.data.probability !== undefined) {
    const updated = await updateStage(params.id, { label: parsed.data.label, probability: parsed.data.probability });
    if (!updated.ok) return fail(updated.reason);
  }
  return NextResponse.json({ ok: true });
});

/** Delete an empty open stage. Owner/admin only. */
export const DELETE = withGuard<{ params: { id: string } }>(async (req, { params }) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "stage-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const result = await deleteStage(params.id);
  if (!result.ok) return fail(result.reason);
  return NextResponse.json({ ok: true });
});
