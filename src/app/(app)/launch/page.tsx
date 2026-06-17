import { getGoLiveStatus } from "@/lib/launch/status";
import { PageHeader } from "@/components/ui";
import { GoLiveConsole } from "@/components/GoLiveConsole";

export const metadata = { title: "Go Live" };
export const dynamic = "force-dynamic";

export default async function LaunchPage() {
  const status = await getGoLiveStatus();
  return (
    <div>
      <PageHeader
        title="Go Live"
        subtitle="Everything it takes for the AI to call your leads — and exactly what's left to switch on."
      />
      <GoLiveConsole status={status} />
    </div>
  );
}
