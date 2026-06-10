import { NextResponse } from "next/server";
import { z } from "zod";
import { listSuppressed, suppressEmail, unsuppressEmail } from "@/lib/suppression";
import { requireRole } from "@/lib/authz";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/**
 * The suppression list: who the engine won't contact (opted out / bounced).
 * Viewing is open to any member; manually suppressing / restoring an address is
 * owner/admin (it changes who gets outreach). Operates on the org's own contacts.
 */
export const GET = withGuard(async () => {
  return NextResponse.json({ suppressed: await listSuppressed() });
});

const Body = z.object({ email: z.string().email().max(200) });

export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "suppression").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  const flagged = await suppressEmail(parsed.data.email);
  return NextResponse.json({ ok: true, flagged });
});

export const DELETE = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "suppression").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  const restored = await unsuppressEmail(parsed.data.email);
  return NextResponse.json({ ok: true, restored });
});
