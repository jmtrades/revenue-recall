import { NextResponse } from "next/server";
import { z } from "zod";
import { billingConfigured, createTopupCheckout } from "@/lib/billing/stripe";
import { getTopupPack } from "@/lib/billing/topups";
import { getSessionUser } from "@/lib/auth";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSupabase } from "@/lib/supabase/client";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { requireRole } from "@/lib/authz";
import { withGuard } from "@/lib/api/guard";
import { writeRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({ pack: z.string(), embedded: z.boolean().optional() });

/** Start a one-time Checkout for a usage top-up pack. */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "billing").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured. Set STRIPE_SECRET_KEY to enable top-ups." }, { status: 503 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !getTopupPack(parsed.data.pack)) {
    return NextResponse.json({ error: "Invalid top-up pack" }, { status: 400 });
  }

  const orgId = (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
  if (!orgId) return NextResponse.json({ error: "No active org" }, { status: 400 });

  const user = await getSessionUser();
  const origin = new URL(req.url).origin;
  try {
    const result = await createTopupCheckout({
      packId: parsed.data.pack,
      orgId,
      customerEmail: user?.email,
      embedded: parsed.data.embedded,
      successUrl: `${origin}/settings?billing=topup`,
      cancelUrl: `${origin}/settings?billing=cancelled`,
      returnUrl: `${origin}/settings?billing=topup&session_id={CHECKOUT_SESSION_ID}`,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Top-up failed" }, { status: 502 });
  }
});
