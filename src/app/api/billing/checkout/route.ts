import { NextResponse } from "next/server";
import { z } from "zod";
import { billingConfigured, createCheckoutSession } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/store";
import { isPlanId } from "@/lib/billing/plans";
import { getSessionUser } from "@/lib/auth";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSupabase } from "@/lib/supabase/client";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { requireRole } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { withGuard } from "@/lib/api/guard";
import { writeRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({
  plan: z.string(),
  seats: z.number().int().positive().max(1000).optional(),
  cycle: z.enum(["monthly", "annual"]).optional(),
  embedded: z.boolean().optional(),
});

export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "billing").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!billingConfigured()) {
    // Never block or alarm the buyer: they're using the product on Starter and
    // can upgrade the moment checkout is switched on.
    return NextResponse.json({ error: "Plans aren't available just yet — you're all set on Starter, and you can upgrade from Settings → Billing the moment checkout is switched on." }, { status: 503 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isPlanId(parsed.data.plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const orgId = (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
  if (!orgId) return NextResponse.json({ error: "No active org" }, { status: 400 });

  const [user, sub] = await Promise.all([getSessionUser(), getSubscription()]);
  const origin = new URL(req.url).origin;

  try {
    const result = await createCheckoutSession({
      plan: parsed.data.plan,
      orgId,
      seats: parsed.data.seats ?? sub.seats,
      cycle: parsed.data.cycle,
      customerEmail: user?.email,
      embedded: parsed.data.embedded,
      successUrl: `${origin}/settings?billing=success`,
      cancelUrl: `${origin}/settings?billing=cancelled`,
      returnUrl: `${origin}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    });
    await recordAudit("billing.checkout_started", parsed.data.plan);
    return NextResponse.json(result);
  } catch (e) {
    // Don't leak Stripe internals to a buyer. A missing price / config gap reads
    // as "not available yet" (with a clear next step), not a hard failure.
    const raw = e instanceof Error ? e.message : "";
    const friendly = /price|configured|stripe/i.test(raw)
      ? "Plans aren't available just yet — you're all set on Starter, and you can upgrade from Settings → Billing shortly."
      : "We couldn't start checkout just now — please try again in a moment.";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
});
