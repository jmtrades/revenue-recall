import { NextResponse } from "next/server";
import { listInvoices } from "@/lib/billing/invoices";
import { requireRole } from "@/lib/authz";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/** This org's recent invoices (owner/admin only). */
export const GET = withGuard(async () => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  return NextResponse.json({ invoices: await listInvoices() });
});
