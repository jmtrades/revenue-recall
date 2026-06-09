import { NextResponse } from "next/server";
import { deleteDeal } from "@/lib/deals";
import { writeRateLimit } from "@/lib/ratelimit";
import { logError, errMessage } from "@/lib/log";

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
