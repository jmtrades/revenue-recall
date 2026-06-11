import { getCallQueue } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { localeFor } from "@/lib/languages";
import { voiceMinutesMeter, estimatedCallsForMinutes } from "@/lib/billing/voice-minutes";
import { PageHeader } from "@/components/ui";
import { DialerView, type DialerVoiceMinutes } from "@/components/DialerView";

export const metadata = { title: "Power Dialer" };
export const dynamic = "force-dynamic";

export default async function DialerPage() {
  const [queue, org, vMeter] = await Promise.all([getCallQueue(), getOrgSettings(), voiceMinutesMeter()]);
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
      <DialerView queue={queue} locale={localeFor(org.language)} voiceMinutes={voiceMinutes} />
    </div>
  );
}
