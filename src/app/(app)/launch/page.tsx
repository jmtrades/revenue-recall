import { getGoLiveStatus } from "@/lib/launch/status";
import { hasSampleData } from "@/lib/sample-data";
import { listRuns } from "@/lib/agent/store";
import { recentAgentActivity } from "@/lib/agent/activity";
import { resolveProvider } from "@/lib/crm/registry";
import { callsToday, callStats } from "@/lib/calls/analytics";
import type { Activity } from "@/lib/crm/types";
import { PageHeader, Card } from "@/components/ui";
import { GoLiveConsole } from "@/components/GoLiveConsole";
import { AgentActivityFeed } from "@/components/AgentActivityFeed";
import { RemoveSampleDataBanner } from "@/components/RemoveSampleDataBanner";
import { TurnOnAutopilotButton } from "@/components/TurnOnAutopilotButton";

export const metadata = { title: "Go Live" };
export const dynamic = "force-dynamic";

export default async function LaunchPage() {
  const [status, sample, runs, acts] = await Promise.all([
    getGoLiveStatus(),
    hasSampleData().catch(() => false),
    listRuns(undefined, 8).catch(() => []),
    resolveProvider().then((p) => p.listRecentActivities(500)).catch(() => [] as Activity[]),
  ]);
  const activity = recentAgentActivity(runs);
  const stats = callStats(acts, 7);
  const today = callsToday(acts);
  const taskOff = status.steps.find((s) => s.key === "task")?.state !== "live";
  return (
    <div>
      <PageHeader
        title="Go Live"
        subtitle="Everything it takes for the AI to call your leads — and exactly what's left to switch on."
      />
      {sample && <div className="mb-6"><RemoveSampleDataBanner /></div>}
      {taskOff && (
        <Card className="mb-6 border-brand/30">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-fg">Let the AI start calling your leads</h2>
              <p className="mt-1 text-sm text-muted">Turn on autopilot and it works your recall queue automatically — within every guardrail. One switch.</p>
            </div>
            <TurnOnAutopilotButton />
          </div>
        </Card>
      )}
      <GoLiveConsole status={status} />
      <div className="mt-6">
        <AgentActivityFeed items={activity} today={today} stats={stats} />
      </div>
    </div>
  );
}
