import Link from "next/link";
import { getUsageSnapshot } from "@/lib/billing/usage";

/**
 * Shows when an org is near or over its monthly AI-action pool. Since metering
 * degrades silently to templates at the limit, this is how a user learns to
 * upgrade or top up. Renders nothing below 80% usage or when not metered.
 */
export async function AiUsageBanner() {
  const u = await getUsageSnapshot();
  if (!u || u.included <= 0) return null;

  const ratio = u.used / u.included;
  if (ratio < 0.8) return null;

  const over = u.used >= u.included && u.credits <= 0;
  const onCredits = u.used >= u.included && u.credits > 0;

  const message = over
    ? `You've used all ${u.included.toLocaleString()} AI actions this month. New drafts fall back to templates until you upgrade or add credits.`
    : onCredits
      ? `Plan AI actions used up — now drawing from ${u.credits.toLocaleString()} credits.`
      : `You've used ${u.used.toLocaleString()} of ${u.included.toLocaleString()} AI actions this month.`;

  return (
    <div
      className={`border-b px-4 py-2 text-sm sm:px-8 ${over ? "border-danger/40 bg-danger/10 text-danger" : "border-warn/40 bg-warn/10 text-warn"}`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <span className="min-w-0 truncate">{message}</span>
        <Link href="/settings" className="shrink-0 font-semibold underline hover:no-underline">
          Upgrade or add credits →
        </Link>
      </div>
    </div>
  );
}
