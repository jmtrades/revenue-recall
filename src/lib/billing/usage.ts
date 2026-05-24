import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getPlan } from "@/lib/billing/plans";

export type ConsumeResult = { ok: true; via: "included" | "credit" } | { ok: false; reason: "quota" };

/**
 * Consume one AI action for the active org, enforcing the plan's monthly pool
 * and falling back to purchased credits. Returns ok:false only when both are
 * exhausted. Fails open on infra errors so a metering hiccup never breaks the
 * product for a paying customer — the quota still bounds cost under normal ops.
 */
export async function consumeAiAction(): Promise<ConsumeResult> {
  const sb = getSupabase();
  const orgId = await resolveActiveOrgId();
  if (!sb || !orgId) return { ok: true, via: "included" };

  try {
    const { data: org } = await sb.from("orgs").select("plan").eq("id", orgId).maybeSingle();
    const plan = getPlan(org?.plan as string | undefined);
    const { data, error } = await sb.rpc("consume_ai_action", {
      p_org: orgId,
      p_included: plan.includedActions,
    });
    if (error) return { ok: true, via: "included" };
    if (data === "exhausted") return { ok: false, reason: "quota" };
    return { ok: true, via: data === "credit" ? "credit" : "included" };
  } catch {
    return { ok: true, via: "included" };
  }
}

/** Current month's usage snapshot for the active org (for the billing UI). */
export async function getUsageSnapshot(): Promise<{
  plan: string;
  used: number;
  included: number;
  credits: number;
} | null> {
  const sb = getSupabase();
  const orgId = await resolveActiveOrgId();
  if (!sb || !orgId) return null;

  const { data: org } = await sb.from("orgs").select("plan, ai_credits").eq("id", orgId).maybeSingle();
  const plan = getPlan(org?.plan as string | undefined);
  const period = new Date();
  const periodStart = `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const { data: usage } = await sb
    .from("ai_usage")
    .select("actions")
    .eq("org_id", orgId)
    .eq("period_start", periodStart)
    .maybeSingle();

  return {
    plan: plan.name,
    used: (usage?.actions as number | undefined) ?? 0,
    included: plan.includedActions,
    credits: (org?.ai_credits as number | undefined) ?? 0,
  };
}
