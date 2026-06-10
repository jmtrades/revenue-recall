import Link from "next/link";
import { getSubscription } from "@/lib/billing/store";
import { effectivePlan, entitlements } from "@/lib/billing/entitlements";
import { money } from "@/lib/format";
import { Icon } from "@/components/icons";

/**
 * Contextual upgrade moment on the Recall page — the one place we can tie the
 * upsell to the org's own numbers instead of a generic banner. Shown only when
 * the workspace has real at-risk revenue AND its plan can't run autopilot
 * (free, or lapsed back to free). Hidden for entitled orgs, empty queues, and
 * on any billing-store error (never break the money page over a nudge).
 */
export async function RecallAutopilotUpsell({
  itemCount,
  recoverable,
  currency,
}: {
  itemCount: number;
  recoverable: number;
  currency: string;
}) {
  if (itemCount === 0 || recoverable <= 0) return null;
  const sub = await getSubscription().catch(() => null);
  if (!sub) return null;
  if (entitlements(effectivePlan(sub.plan, sub.status)).autopilot) return null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand/40 bg-gradient-to-r from-brand-soft/50 via-surface to-surface p-5 ring-glow">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.35)]">
          <Icon name="autopilot" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">
            Autopilot could be working {itemCount === 1 ? "this deal" : `all ${itemCount} of these`} right now —{" "}
            <span className="text-brand">{money(recoverable, currency)}</span> on the line.
          </p>
          <p className="mt-0.5 text-sm text-muted">
            It writes in your voice, sends, calls, and follows up until they reply — around the clock, with guardrails. You approve the wins.
          </p>
        </div>
        <div className="flex flex-none flex-col items-stretch gap-1.5 sm:items-end">
          <Link
            href="/settings?tab=billing"
            className="cta inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand/90"
          >
            Turn on Autopilot
          </Link>
          <span className="text-center text-[11px] text-muted sm:text-right">From $299/mo · cancel anytime</span>
        </div>
      </div>
    </section>
  );
}
