import { getCallQueue } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { DialerView } from "@/components/DialerView";

export const dynamic = "force-dynamic";

export default async function DialerPage() {
  const queue = await getCallQueue();
  return (
    <div>
      <PageHeader title="Power Dialer" subtitle="Work your highest-value calls back-to-back with AI prep and auto-logged outcomes." />
      <DialerView queue={queue} />
    </div>
  );
}
