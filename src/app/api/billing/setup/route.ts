import { NextResponse } from "next/server";
import { provisionStripeCatalog } from "@/lib/billing/provision";
import { requireAdmin } from "@/lib/admin";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Operator-only: auto-create the full Stripe catalog (plans, annual prices, and
 * usage top-ups) in the connected Stripe account. Idempotent. Guarded by
 * ADMIN_TOKEN (constant-time, rate-limited, audited) — a platform setup action,
 * not per-customer.
 *
 *   curl -X POST https://<your-domain>/api/billing/setup \
 *        -H "Authorization: Bearer $ADMIN_TOKEN"
 */
export const POST = withGuard(async (req: Request) => {
  const denied = requireAdmin(req, "billing-setup");
  if (denied) return denied;
  const result = await provisionStripeCatalog();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});
