import Link from "next/link";
import { getSubscription } from "@/lib/billing/store";
import { subscriptionStanding } from "@/lib/billing/entitlements";
import { DismissibleBanner } from "@/components/DismissibleBanner";

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

  const inner = (
    <>
      <span className="min-w-0 flex-1 truncate">{s.message}</span>
      <Link
        href="/settings?tab=billing"
        className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition ${s.urgent ? "bg-danger text-white hover:bg-danger/90" : "bg-brand-strong text-white hover:bg-brand-strong/90"}`}
      >
        {s.cta}
      </Link>
    </>
  );

  // A payment problem (urgent) stays put until resolved; the soft free/trial nudge
  // is dismissible for the session so it doesn't eat space on every screen.
  if (s.urgent) {
    return <div className="flex items-center gap-3 bg-danger/15 px-4 py-2 text-sm text-danger sm:px-8">{inner}</div>;
  }
  // Content-keyed so dismissing one soft nudge (e.g. trial) doesn't suppress a
  // different one that appears later in the same session (e.g. free-plan upsell).
  return <DismissibleBanner id={`billing:${s.message}`} className="bg-brand-soft/30 text-fg">{inner}</DismissibleBanner>;
}
