import { NextResponse } from "next/server";
import { listAudit } from "@/lib/audit";
import { requireRole } from "@/lib/authz";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/** Recent audit events for the current org (owner/admin only). */
export const GET = withGuard(async () => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  return NextResponse.json({ events: await listAudit() });
});
