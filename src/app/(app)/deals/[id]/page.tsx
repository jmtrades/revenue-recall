import Link from "next/link";
import { notFound } from "next/navigation";
import { getDealDetail } from "@/lib/queries";
import { resolveProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { allSequencesFor } from "@/lib/sequences-store";
import { money, relativeDays } from "@/lib/format";
import { Card, Avatar, InfoRow, ActivityIcon, EmptyState } from "@/components/ui";
import { DealActions } from "@/components/DealActions";
import { DealInfoEdit } from "@/components/DealInfoEdit";
import { DeleteButton } from "@/components/DeleteButton";
import { EnrollPicker } from "@/components/EnrollPicker";
import { AiBrief } from "@/components/AiBrief";
import { SpeakButton } from "@/components/SpeakButton";
import { contactInsights } from "@/lib/insights";
import { listRecallTouches } from "@/lib/recall/events";
import { recallJourney } from "@/lib/recall/insights";
import { getLanguage, toLanguageCode } from "@/lib/languages";

export const metadata = { title: "Deal" };
export const dynamic = "force-dynamic";

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default async function DealPage({ params }: { params: { id: string } }) {
  const detail = await getDealDetail(params.id);
  if (!detail) notFound();
  const { opp, contact, owner, pipeline, stage, activities, fields } = detail;
  const provider = (await resolveProvider());
  // Org members for the reassignment select (best-effort; hidden when empty).
  const members = await provider.listUsers().catch(() => []);
  const canWrite = provider.info().capabilities.write;
  const canEdit = canWrite && typeof provider.updateOpportunity === "function";
  const canDelete = canWrite && typeof provider.deleteOpportunity === "function";
  const sequences = (await allSequencesFor((await getOrgSettings()).industryId)).map((s) => ({ id: s.id, name: s.name }));
  const openStages = pipeline.stages.filter((s) => s.type === "open");
  const currentIdx = openStages.findIndex((s) => s.id === stage?.id);
  const insights = contactInsights(activities);
  // This deal's recall history — the in-product proof of how recall worked it.
  const journey = recallJourney((await listRecallTouches().catch(() => [])).filter((t) => t.dealId === opp.id));
  const responsivenessStyle: Record<string, string> = {
    high: "bg-success/15 text-success",
    medium: "bg-brand-soft text-brand",
    low: "bg-warn/15 text-warn",
    unknown: "bg-surface-2 text-muted",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href="/pipeline" className="hover:text-fg">Pipeline</Link>
        <span>/</span>
        <span className="text-fg">{opp.title}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{opp.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted">
            <span className={`pill ${stage?.type === "won" ? "bg-success/15 text-success" : stage?.type === "lost" ? "bg-danger/15 text-danger" : "bg-brand-soft text-brand"}`}>{stage?.label}</span>
            <span>·</span>
            <span className="text-xl font-semibold text-fg">{money(opp.value, opp.currency)}</span>
          </div>
        </div>
      </div>

      {/* Stage progress */}
      {stage?.type === "open" && (
        <div className="flex items-center gap-1">
          {openStages.map((s, i) => (
            <div key={s.id} className="flex flex-1 flex-col gap-1">
              <div className={`h-1.5 rounded-full ${i <= currentIdx ? "bg-brand" : "bg-surface-2"}`} />
              <span className={`text-[10px] ${i === currentIdx ? "text-fg" : "text-muted"}`}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Activity timeline">
            {activities.length === 0 ? (
              <EmptyState iconName="note" title="No activity yet" hint="Log a call, email, or note to start the history." />
            ) : (
              <ol className="relative space-y-4 before:absolute before:left-4 before:top-2 before:h-full before:w-px before:bg-border">
                {activities.map((a) => (
                  <li key={a.id} className="relative flex gap-3">
                    <ActivityIcon kind={a.kind} />
                    <div className="flex-1 pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm capitalize text-fg">{a.kind.replace("_", " ")}{a.direction ? ` · ${a.direction}` : ""}</span>
                        <div className="flex flex-none items-center gap-1.5">
                          {a.kind === "call" && a.summary && <SpeakButton text={a.summary} label="" />}
                          <span className="text-xs text-muted">{relativeDays(daysAgo(a.occurredAt))}</span>
                        </div>
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
          <AiBrief dealId={opp.id} />

          {journey.totalTouches > 0 && (
            <Card title="Recall journey">
              <p className="mb-3 text-sm text-muted">
                {journey.totalTouches} touch{journey.totalTouches === 1 ? "" : "es"}
                {journey.firstTouchAt ? ` since recall began ${relativeDays(daysAgo(journey.firstTouchAt))}` : ""}
                {journey.channels.length ? ` · ${journey.channels.join(", ")}` : ""}.
              </p>
              <ol className="relative space-y-3 before:absolute before:left-4 before:top-2 before:h-full before:w-px before:bg-border">
                {journey.timeline.map((tch) => (
                  <li key={tch.id} className="relative flex gap-3">
                    <ActivityIcon kind={tch.channel} />
                    <div className="flex flex-1 items-center justify-between gap-2 pb-1">
                      <span className="text-sm capitalize text-fg">{tch.channel} · {tch.source}</span>
                      <span className="flex-none text-xs text-muted">{relativeDays(daysAgo(tch.occurredAt))}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <Card>
            <DealActions dealId={opp.id} stages={pipeline.stages} currentStageId={opp.stageId} canWrite={canWrite} />
          </Card>

          {canWrite && sequences.length > 0 && (
            <Card title="Add to a sequence">
              <p className="mb-3 text-sm text-muted">Hand this deal to a cadence — each step sends on its day until they reply or close.</p>
              <EnrollPicker scope={`deal:${opp.id}`} sequences={sequences} />
            </Card>
          )}

          {contact && (
            <Card title="Contact">
              <Link href={`/leads/${contact.id}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-surface-2">
                <Avatar name={contact.name} size={40} />
                <div>
                  <div className="text-sm font-medium text-fg">{contact.name}</div>
                  {contact.company && <div className="text-xs text-muted">{contact.company}</div>}
                </div>
              </Link>
              <div className="mt-3 space-y-1">
                {contact.points.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-xs uppercase text-muted">{p.channel}</span>
                    <span className="text-fg">{p.value}</span>
                  </div>
                ))}
                {(() => {
                  const code = toLanguageCode(typeof contact.attributes?.preferredLanguage === "string" ? contact.attributes.preferredLanguage : typeof contact.attributes?.language === "string" ? contact.attributes.language : undefined);
                  return code ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-xs uppercase text-muted">language</span>
                      <span className="text-fg">{getLanguage(code).label}</span>
                    </div>
                  ) : null;
                })()}
              </div>
            </Card>
          )}

          <Card title="Best way to reach them">
            <div className="flex items-center gap-2">
              <span className={`pill capitalize ${responsivenessStyle[insights.responsiveness]}`}>{insights.responsiveness} responsiveness</span>
              {insights.bestChannel && (
                <span className="pill bg-brand-soft text-brand capitalize">{insights.bestChannel === "sms" ? "text" : insights.bestChannel}</span>
              )}
              {insights.bestTime && <span className="pill bg-surface-2 text-muted">{insights.bestTime}</span>}
            </div>
            <p className="mt-3 text-sm text-muted">{insights.note}</p>
          </Card>

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
            {canEdit && (
              <DealInfoEdit
                dealId={opp.id}
                currency={opp.currency}
                owners={members.map((u) => ({ id: u.id, name: u.name }))}
                initial={{
                  title: opp.title,
                  value: opp.value,
                  expectedCloseAt: opp.expectedCloseAt ? new Date(opp.expectedCloseAt).toISOString().slice(0, 10) : "",
                  ownerId: opp.ownerId ?? "",
                }}
              />
            )}
          </Card>

          {canDelete && (
            <Card title="Danger zone">
              <p className="mb-3 text-sm text-muted">Permanently remove this deal and its activity. This can&apos;t be undone — use it for junk or duplicate records that skew your pipeline.</p>
              <DeleteButton
                endpoint={`/api/opportunities/${opp.id}`}
                label="Delete deal"
                confirmText={`Permanently delete “${opp.title}”? Its activity history goes with it. This can't be undone.`}
                redirectTo="/pipeline"
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
