import { getCallQueue } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { localeFor } from "@/lib/languages";
import { PageHeader } from "@/components/ui";
import { DialerView } from "@/components/DialerView";

export const dynamic = "force-dynamic";

export default async function DialerPage() {
  const [queue, org] = await Promise.all([getCallQueue(), getOrgSettings()]);
  return (
    <div>
      <PageHeader title="Power Dialer" subtitle="Work your highest-value calls back-to-back with AI prep and auto-logged outcomes." />
      <DialerView queue={queue} locale={localeFor(org.language)} />
    </div>
  );
}
