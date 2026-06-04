import { NextResponse } from "next/server";
import { billingConfigured, createPortalSession } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/store";
import { requireRole } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Open the Stripe customer portal so a customer can manage or cancel billing. */
export async function POST(req: Request) {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });
  }
  const sub = await getSubscription();
  if (!sub.stripeCustomerId) {
    return NextResponse.json({ error: "No billing customer yet — start a subscription first." }, { status: 400 });
  }
  try {
    const url = await createPortalSession(sub.stripeCustomerId, `${new URL(req.url).origin}/settings`);
    await recordAudit("billing.portal_opened");
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Portal failed" }, { status: 502 });
  }
}
