import { getGoLiveStatus } from "@/lib/launch/status";
import { hasSampleData } from "@/lib/sample-data";
import { PageHeader } from "@/components/ui";
import { GoLiveConsole } from "@/components/GoLiveConsole";
import { RemoveSampleDataBanner } from "@/components/RemoveSampleDataBanner";

export const metadata = { title: "Go Live" };
export const dynamic = "force-dynamic";

export default async function LaunchPage() {
  const [status, sample] = await Promise.all([getGoLiveStatus(), hasSampleData().catch(() => false)]);
  return (
    <div>
      <PageHeader
        title="Go Live"
        subtitle="Everything it takes for the AI to call your leads — and exactly what's left to switch on."
      />
      {sample && <div className="mb-6"><RemoveSampleDataBanner /></div>}
      <GoLiveConsole status={status} />
    </div>
  );
}
