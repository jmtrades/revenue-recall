import { getCallQueue } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { localeFor } from "@/lib/languages";
import { voiceMinutesMeter, estimatedCallsForMinutes } from "@/lib/billing/voice-minutes";
import { bestCallWindow, windowLabel } from "@/lib/calls/analytics";
import { resolveProvider } from "@/lib/crm/registry";
import { pct } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DialerView, type DialerVoiceMinutes } from "@/components/DialerView";
import type { Activity } from "@/lib/crm/types";

export const metadata = { title: "Power Dialer" };
export const dynamic = "force-dynamic";

export default async function DialerPage() {
  const [queue, org, vMeter, recentActs] = await Promise.all([
    getCallQueue(),
    getOrgSettings(),
    voiceMinutesMeter(),
    resolveProvider().then((p) => p.listRecentActivities(500)).catch(() => [] as Activity[]),
  ]);
  // The org's own proven calling hour (null until ~30 dials of signal) — the
  // cheapest connect-rate lift is pointing today's block at it.
  const { best } = bestCallWindow(recentActs, 30, new Date(), org.timezone || undefined);
  // Only count down when there's a real balance (plan minutes + top-ups):
  // unlimited plans and zero-minute orgs get no chip (Infinity sanitized).
  const voiceMinutes: DialerVoiceMinutes = {
    metered: !vMeter.unlimited && vMeter.limitMin > 0,
    remainingMin: Number.isFinite(vMeter.remainingMin) ? vMeter.remainingMin : 0,
    callsLeft: Number.isFinite(vMeter.remainingMin) ? estimatedCallsForMinutes(vMeter.remainingMin) : 0,
  };
  return (
    <div>
      <PageHeader title="Power Dialer" subtitle="Work your highest-value calls back-to-back with AI prep and auto-logged outcomes." />
      {best && (
        <p className="mb-4 text-sm text-muted">
          Your best window: <span className="font-medium text-fg">{windowLabel(best.hour)}</span> — {pct(best.connectRate)} connect rate over your last 30 days of dials.
        </p>
      )}
      <DialerView queue={queue} locale={localeFor(org.language)} voiceMinutes={voiceMinutes} />
    </div>
  );
}
