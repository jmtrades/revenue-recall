import Link from "next/link";
import type { SetupChecklist } from "@/lib/onboarding/checklist";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";

/**
 * Post-onboarding activation checklist for the dashboard. Renders only while
 * setup is incomplete (the caller gates on `complete`), guiding a new user
 * step-by-step to their first recall touch. Each step links to where it's done.
 * Distinct from the go-live SetupChecklist (connections) on the settings page.
 */
export function ActivationChecklist({ data }: { data: SetupChecklist }) {
  if (data.complete) return null;
  return (
    <Card title="Finish setting up">
      <p className="mb-4 text-sm text-muted">{data.doneCount} of {data.total} done — a few steps to your first recovered deal.</p>
      <ol className="space-y-2.5">
        {data.steps.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${s.done ? "border-border/60 opacity-70" : "border-border hover:border-brand/50 hover:bg-surface-2"}`}
            >
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-success/15 text-success" : "border border-border text-muted"}`}>
                {s.done ? <Icon name="check" size={12} /> : null}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${s.done ? "text-muted line-through" : "text-fg"}`}>{s.title}</span>
                {!s.done && <span className="mt-0.5 block text-xs text-muted">{s.description}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
