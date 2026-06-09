import { NextResponse } from "next/server";
import { z } from "zod";
import { createStage } from "@/lib/stages-admin";
import { requireRole } from "@/lib/authz";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const Body = z.object({
  label: z.string().trim().min(1).max(60),
  /** 0..1 default win probability for the new stage. */
  probability: z.number().min(0).max(1).default(0.2),
});

/** Add an open pipeline stage. Owner/admin; Supabase-backed workspaces only. */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "stage-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Stage needs a name (and a 0–1 probability)" }, { status: 400 });

  const result = await createStage(parsed.data.label, parsed.data.probability);
  if (!result.ok) {
    return NextResponse.json({ error: "Stages can't be edited here — your connected CRM owns its pipeline." }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
});
