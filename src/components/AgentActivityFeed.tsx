import type { AgentActivityItem } from "@/lib/agent/activity";
import { resultLabel } from "@/lib/agent/activity";
import { Card } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { relativeDays } from "@/lib/format";

const ICON: Record<string, IconName> = { call: "dialer", sms: "message", email: "mail", recommend: "note" };
const TONE: Record<string, string> = {
  sent: "text-success",
  logged: "text-muted",
  drafted: "text-brand",
  queued: "text-warn",
  skipped: "text-muted",
};

function ago(iso: string): string {
  return relativeDays(Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

/**
 * "What the agent is doing" — a plain timeline of the autopilot's real actions
 * (who it called/texted, the outcome, when), so it's never a black box. Renders
 * an honest empty state when the agent hasn't acted yet.
 */
export function AgentActivityFeed({ items }: { items: AgentActivityItem[] }) {
  return (
    <Card title="What the agent is doing">
      {items.length === 0 ? (
        <p className="text-sm text-muted">No autopilot activity yet. Once it’s live, every call, text, and email it sends shows up here.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((a, i) => (
            <li key={`${a.at}-${i}`} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-muted">
                <Icon name={ICON[a.type] ?? "autopilot"} size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-fg"><span className={`font-medium ${TONE[a.result] ?? "text-fg"}`}>{resultLabel(a.type, a.result)}</span> · {a.title}</span>
                  <span className="shrink-0 text-xs text-muted">{ago(a.at)}</span>
                </div>
                <p className="truncate text-xs text-muted">{a.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
