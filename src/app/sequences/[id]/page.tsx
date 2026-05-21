import Link from "next/link";
import { notFound } from "next/navigation";
import { getSequence } from "@/lib/sequences";
import { INDUSTRIES } from "@/lib/industries";
import { PageHeader, Card, ChannelBadge, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function SequenceDetailPage({ params }: { params: { id: string } }) {
  const seq = getSequence(params.id);
  if (!seq) notFound();

  const channels = [...new Set(seq.steps.map((s) => s.channel))];
  const span = Math.max(...seq.steps.map((s) => s.day));
  const audience = seq.industries.includes("*") ? "All industries" : seq.industries.map((i) => INDUSTRIES.find((x) => x.id === i)?.label ?? i).join(", ");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href="/sequences" className="hover:text-white">Sequences</Link>
        <span>/</span>
        <span className="text-white">{seq.name}</span>
      </div>

      <PageHeader title={seq.name} subtitle={seq.goal} />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Steps" value={String(seq.steps.length)} />
        <Stat label="Duration" value={`${span} days`} />
        <Stat label="Channels" value={String(channels.length)} hint={channels.join(" · ")} />
        <Stat label="Audience" value={audience} />
      </section>

      <Card title="Cadence">
        <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
          {seq.steps.map((step, i) => (
            <li key={i} className="relative flex gap-4">
              <span className="z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xs font-semibold text-white">{i + 1}</span>
              <div className="flex-1 rounded-lg border border-border bg-surface-2 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="pill bg-brand-soft text-brand">Day {step.day}</span>
                  <ChannelBadge channel={step.channel} />
                  <span className="font-medium text-white">{step.subject}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
