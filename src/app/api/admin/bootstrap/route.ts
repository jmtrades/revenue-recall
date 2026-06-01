import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { bootstrapOrg } from "@/lib/supabase/bootstrap";
import { requireAdmin } from "@/lib/admin";
import { logError, errMessage } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  industryId: z.string().optional(),
  demo: z.boolean().optional(),
  orgName: z.string().optional(),
});

/**
 * Initialize a fresh Supabase database. Guarded by ADMIN_TOKEN — send it as a
 * Bearer token. Intended to be run once after wiring the database.
 */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 409 });
  }
  const denied = requireAdmin(req, "bootstrap");
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const result = await bootstrapOrg(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    logError("admin.bootstrap.failed", { error: errMessage(err) });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bootstrap failed" }, { status: 500 });
  }
}
