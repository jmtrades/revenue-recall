import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteDeal, updateDealRecord, type DealPatch } from "@/lib/deals";
import { writeRateLimit } from "@/lib/ratelimit";
import { logError, errMessage } from "@/lib/log";

const PatchBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    value: z.number().min(0).max(1_000_000_000).optional(),
    // From a <input type="date"> (YYYY-MM-DD) or a full ISO string.
    expectedCloseAt: z.string().trim().min(1).optional(),
    // Reassign the deal; an empty string unassigns it.
    ownerId: z.string().max(200).optional(),
  })
  .refine((d) => d.title !== undefined || d.value !== undefined || d.expectedCloseAt !== undefined || d.ownerId !== undefined, {
    message: "Provide a field to update",
  });

/** Edit a deal's title / value / expected close / owner. Session-gated; rate-limited. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!writeRateLimit(req, "deal-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid deal update" }, { status: 400 });

  const patch: DealPatch = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.value !== undefined) patch.value = parsed.data.value;
  if (parsed.data.ownerId !== undefined) patch.ownerId = parsed.data.ownerId;
  if (parsed.data.expectedCloseAt !== undefined) {
    const d = new Date(parsed.data.expectedCloseAt);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid close date" }, { status: 400 });
    patch.expectedCloseAt = d.toISOString();
  }

  try {
    const result = await updateDealRecord(params.id, patch);
    if (!result.ok) {
      if (result.reason === "not_found") return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      return NextResponse.json({ error: "This CRM doesn't support editing deals here." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, opportunity: result.opp });
  } catch (err) {
    logError("deals.edit.failed", { error: errMessage(err) });
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}

/** Permanently delete a deal. Session-gated by middleware; rate-limited. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!writeRateLimit(req, "deal-delete").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const result = await deleteDeal(params.id);
    if (!result.ok) {
      if (result.reason === "not_found") return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      return NextResponse.json({ error: "This CRM doesn't support deleting deals here." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("deals.delete.failed", { error: errMessage(err) });
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}
