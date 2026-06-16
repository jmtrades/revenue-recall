/**
 * Server-only side of the referral loop: grant the one-time reward when a
 * referred workspace first activates a paid plan. Called from the billing
 * webhook. Idempotent and best-effort — it must never throw into the webhook.
 */
import { getSupabase } from "@/lib/supabase/client";
import { addUsageCredits } from "@/lib/ai/usage";
import { parseReferralCode, referralReward } from "@/lib/referrals";
import { logError } from "@/lib/log";

/**
 * If `orgId` was referred and hasn't been rewarded yet, credit both the referrer
 * and the referee with bonus AI messages. Idempotency is double-guarded: we
 * atomically CLAIM the reward by flipping `referral_rewarded` false→true (a
 * webhook retry that loses the race grants nothing), and addUsageCredits is also
 * deduped on its `ref`.
 */
export async function maybeGrantReferralReward(orgId: string): Promise<void> {
  try {
    const client = getSupabase();
    if (!client) return;
    const { data } = await client.from("orgs").select("referred_by, referral_rewarded").eq("id", orgId).maybeSingle();
    const referrer = parseReferralCode(data?.referred_by as string | null | undefined);
    // Not referred, already rewarded, or a self-referral that slipped through → nothing to do.
    if (!referrer || data?.referral_rewarded || referrer === orgId.trim().toLowerCase()) return;

    // Claim atomically: only the request that flips the flag may grant, so a
    // retry (or a concurrent event) can never double-pay.
    const { data: claimed } = await client
      .from("orgs")
      .update({ referral_rewarded: true })
      .eq("id", orgId)
      .eq("referral_rewarded", false)
      .select("id");
    if (!claimed || claimed.length === 0) return;

    const reward = referralReward();
    await addUsageCredits({ orgId: referrer, actions: reward.referrer, source: "topup", ref: `referral:${orgId}` });
    await addUsageCredits({ orgId, actions: reward.referee, source: "topup", ref: `referral:${orgId}:referee` });
  } catch (e) {
    logError("billing.referral.reward_failed", { orgId, error: e instanceof Error ? e.message : String(e) });
  }
}
