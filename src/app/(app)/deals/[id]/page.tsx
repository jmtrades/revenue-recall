import Link from "next/link";
import { notFound } from "next/navigation";
import { getDealDetail } from "@/lib/queries";
import { getProvider } from "@/lib/crm/registry";
import { money, relativeDays } from "@/lib/format";
import { Card, Avatar, InfoRow, ActivityIcon, EmptyState } from "@/components/ui";
import { DealActions } from "@/components/DealActions";

export const dynamic = "force-dynamic";

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default async function DealPage({ params }: { params: { id: string } }) {
  const detail = await getDealDetail(params.id);
  if (!detail) notFound();
  const { opp, contact, owner, pipeline, stage, activities, fields } = detail;
  const canWrite = getProvider().info().capabilities.write;
  const openStages = pipeline.stages.filter((s) => s.type === "open");
  const currentIdx = openStages.findIndex((s) => s.id === stage?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href="/pipeline" className="hover:text-white">Pipeline</Link>
        <span>/</span>
        <span className="text-white">{opp.title}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{opp.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted">
            <span className={`pill ${stage?.type === "won" ? "bg-success/15 text-success" : stage?.type === "lost" ? "bg-danger/15 text-danger" : "bg-brand-soft text-brand"}`}>{stage?.label}</span>
            <span>·</span>
            <span className="text-xl font-semibold text-white">{money(opp.value, opp.currency)}</span>
          </div>
        </div>
      </div>

      {/* Stage progress */}
      {stage?.type === "open" && (
        <div className="flex items-center gap-1">
          {openStages.map((s, i) => (
            <div key={s.id} className="flex flex-1 flex-col gap-1">
              <div className={`h-1.5 rounded-full ${i <= currentIdx ? "bg-brand" : "bg-surface-2"}`} />
              <span className={`text-[10px] ${i === currentIdx ? "text-white" : "text-muted"}`}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Activity timeline">
            {activities.length === 0 ? (
              <EmptyState icon="📋" title="No activity yet" hint="Log a call, email, or note to start the history." />
            ) : (
              <ol className="relative space-y-4 before:absolute before:left-4 before:top-2 before:h-full before:w-px before:bg-border">
                {activities.map((a) => (
                  <li key={a.id} className="relative flex gap-3">
                    <ActivityIcon kind={a.kind} />
                    <div className="flex-1 pb-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm capitalize text-white">{a.kind.replace("_", " ")}{a.direction ? ` · ${a.direction}` : ""}</span>
                        <span className="text-xs text-muted">{relativeDays(daysAgo(a.occurredAt))}</span>
                      </div>
                      <p className="text-sm text-muted">{a.summary}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <DealActions dealId={opp.id} stages={pipeline.stages} currentStageId={opp.stageId} canWrite={canWrite} />
          </Card>

          {contact && (
            <Card title="Contact">
              <Link href={`/leads/${contact.id}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-surface-2">
                <Avatar name={contact.name} size={40} />
                <div>
                  <div className="text-sm font-medium text-white">{contact.name}</div>
                  {contact.company && <div className="text-xs text-muted">{contact.company}</div>}
                </div>
              </Link>
              <div className="mt-3 space-y-1">
                {contact.points.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-xs uppercase text-muted">{p.channel}</span>
                    <span className="text-white">{p.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Details">
            <InfoRow label="Owner">{owner ? <span className="flex items-center gap-2"><Avatar name={owner.name} size={22} />{owner.name}</span> : "—"}</InfoRow>
            <InfoRow label="Source">{opp.source ?? "—"}</InfoRow>
            <InfoRow label="Created">{relativeDays(daysAgo(opp.createdAt))}</InfoRow>
            <InfoRow label="Last touch">{opp.lastActivityAt ? relativeDays(daysAgo(opp.lastActivityAt)) : "—"}</InfoRow>
            {opp.expectedCloseAt && <InfoRow label="Expected close">{new Date(opp.expectedCloseAt).toLocaleDateString()}</InfoRow>}
            {opp.lossReason && <InfoRow label="Loss reason">{opp.lossReason}</InfoRow>}
            {fields.map((f) => (
              <InfoRow key={f.key} label={f.label}>{String(contact?.attributes?.[f.key] ?? "—")}</InfoRow>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
