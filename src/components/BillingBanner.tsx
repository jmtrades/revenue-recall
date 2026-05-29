import Link from "next/link";
import { getSubscription } from "@/lib/billing/store";
import { subscriptionStanding } from "@/lib/billing/entitlements";

/**
 * Account-standing banner shown across the app: urgent (red) for a payment
 * problem, a soft (brand) nudge for free/trial. Hidden entirely for active paid
 * orgs. Server-rendered — links to billing settings.
 */
export async function BillingBanner() {
  const sub = await getSubscription().catch(() => null);
  if (!sub) return null;
  const s = subscriptionStanding(sub.plan, sub.status);
  if (!s.prompt) return null;

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2 text-sm sm:px-8 ${s.urgent ? "bg-danger/15 text-danger" : "bg-brand-soft/30 text-fg"}`}>
      <span className="min-w-0 truncate">{s.message}</span>
      <Link
        href="/settings"
        className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition ${s.urgent ? "bg-danger text-white hover:bg-danger/90" : "bg-brand text-white hover:bg-brand/90"}`}
      >
        {s.cta}
      </Link>
    </div>
  );
}
