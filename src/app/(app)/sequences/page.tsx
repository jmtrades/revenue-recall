import Link from "next/link";
import { getConfig } from "@/lib/config";
import { sequencesFor } from "@/lib/sequences";
import { PageHeader, ChannelBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function SequencesPage() {
  const cfg = getConfig();
  const sequences = sequencesFor(cfg.industryId);

  return (
    <div>
      <PageHeader title="Sequences" subtitle="Multi-step, multi-channel cadences tuned to your industry." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {sequences.map((seq) => (
          <section key={seq.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/sequences/${seq.id}`} className="font-semibold text-white hover:underline">{seq.name}</Link>
                <p className="mt-1 text-sm text-muted">{seq.goal}</p>
              </div>
              <span className="pill bg-surface-2 text-muted">{seq.steps.length} steps</span>
            </div>
            <ol className="mt-4 space-y-3">
              {seq.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex w-12 shrink-0 flex-col items-center">
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-border text-xs text-muted">{i + 1}</span>
                    <span className="mt-1 text-[10px] uppercase tracking-wide text-muted">Day {step.day}</span>
                  </div>
                  <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <ChannelBadge channel={step.channel} />
                      <span className="truncate text-sm font-medium text-white">{step.subject}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
