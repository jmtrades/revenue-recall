import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { createPortalSession, stripeConfigured } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });
  }
  const sb = getSupabase();
  const orgId = await resolveActiveOrgId();
  if (!sb || !orgId) return NextResponse.json({ error: "No active workspace." }, { status: 401 });

  const { data: org } = await sb.from("orgs").select("stripe_customer_id").eq("id", orgId).maybeSingle();
  const customerId = org?.stripe_customer_id as string | undefined;
  if (!customerId) return NextResponse.json({ error: "No billing account yet." }, { status: 400 });

  const origin = new URL(req.url).origin;
  try {
    const session = await createPortalSession(customerId, `${origin}/settings`);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Portal failed." }, { status: 500 });
  }
}
