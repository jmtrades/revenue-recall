import { NextResponse } from "next/server";
import { provisionStripeCatalog } from "@/lib/billing/provision";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Operator-only: auto-create the full Stripe catalog (plans, annual prices, and
 * usage top-ups) in the connected Stripe account. Idempotent. Guarded by
 * ADMIN_TOKEN as a Bearer token — it's a platform setup action, not per-customer.
 *
 *   curl -X POST https://<your-domain>/api/billing/setup \
 *        -H "Authorization: Bearer $ADMIN_TOKEN"
 */
export async function POST(req: Request) {
  const adminToken = process.env.ADMIN_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!adminToken || auth !== `Bearer ${adminToken}`) {
    return NextResponse.json({ error: "Unauthorized — send Authorization: Bearer <ADMIN_TOKEN>." }, { status: 401 });
  }
  const result = await provisionStripeCatalog();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
