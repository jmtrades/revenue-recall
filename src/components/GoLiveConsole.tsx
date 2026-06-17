import Link from "next/link";
import type { GoLiveStatus, GoLiveState } from "@/lib/launch/go-live";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";

const DOT: Record<GoLiveState, string> = {
  live: "bg-success",
  attention: "bg-warn",
  off: "bg-muted/40",
};
const TEXT: Record<GoLiveState, string> = {
  live: "text-success",
  attention: "text-warn",
  off: "text-muted",
};
const WORD: Record<GoLiveState, string> = { live: "Ready", attention: "Needs attention", off: "Not set up" };

/**
 * The "Go Live" command center. Answers, at a glance: can the AI call my leads
 * right now? If not, exactly which switch is off and where to flip it. Every gate
 * that used to be invisible is one row here.
 */
export function GoLiveConsole({ status }: { status: GoLiveStatus }) {
  const { liveForAutonomousCalls, liveForManualCalls, readyCount, total, steps } = status;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${liveForAutonomousCalls ? "bg-success" : "bg-warn"}`} />
              <h2 className="text-lg font-semibold text-fg">
                {liveForAutonomousCalls
                  ? "You're live — the AI is calling your leads"
                  : `${readyCount} of ${total} steps ready to go fully live`}
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted">
              {liveForAutonomousCalls
                ? "Autopilot is dialing your list on schedule, in your voice, only the leads who've consented."
                : "Finish the steps below and the AI will call your leads automatically. Each one tells you exactly what to do."}
            </p>
          </div>
          <div className="flex gap-2">
            <span className={`pill ${liveForManualCalls ? "bg-success/15 text-success" : "bg-warn/15 text-warn"}`}>
              {liveForManualCalls ? "Manual calls live" : "Manual calls not live"}
            </span>
            <span className={`pill ${liveForAutonomousCalls ? "bg-success/15 text-success" : "bg-warn/15 text-warn"}`}>
              {liveForAutonomousCalls ? "Autopilot live" : "Autopilot off"}
            </span>
          </div>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={readyCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${readyCount} of ${total} go-live steps ready`}
        >
          <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${Math.round((readyCount / total) * 100)}%` }} />
        </div>
      </Card>

      <Card title="Everything the AI needs to call your leads">
        <ol className="divide-y divide-border/60">
          {steps.map((s) => (
            <li key={s.key} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
              <span className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.state === "live" ? "bg-success/15" : s.state === "attention" ? "bg-warn/15" : "bg-surface-2"}`}>
                {s.state === "live" ? (
                  <Icon name="check" size={12} strokeWidth={3} className="text-success" />
                ) : (
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.state]}`} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg">{s.title}</span>
                  <span className={`text-[11px] font-medium ${TEXT[s.state]}`}>· {WORD[s.state]}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted">{s.detail}</p>
              </div>
              {s.action && s.state !== "live" && (
                <Link href={s.action.href} className="shrink-0 self-center rounded-lg border border-border px-3 py-1.5 text-xs text-fg transition hover:border-brand">
                  {s.action.label} →
                </Link>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
