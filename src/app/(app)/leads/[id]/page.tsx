import Link from "next/link";
import { notFound } from "next/navigation";
import { getContactDetail } from "@/lib/queries";
import { getProvider } from "@/lib/crm/registry";
import { getConfig } from "@/lib/config";
import { sequencesFor } from "@/lib/sequences";
import { money, relativeDays } from "@/lib/format";
import { Card, Avatar, InfoRow, ActivityIcon, EmptyState } from "@/components/ui";
import { ContactReachOut } from "@/components/ContactReachOut";

export const dynamic = "force-dynamic";

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default async function ContactPage({ params }: { params: { id: string } }) {
  const detail = await getContactDetail(params.id);
  if (!detail) notFound();
  const { contact, deals, activities } = detail;
  const totalValue = deals.reduce((s, d) => s + d.value, 0);

  // Reach-out: which channels this contact is actually reachable on, the
  // sequences available to enroll them in, and whether this workspace can write.
  const canWrite = getProvider().info().capabilities.write;
  const canEmail = contact.points.some((p) => p.channel === "email" && !!p.value);
  const canText = contact.points.some((p) => (p.channel === "phone" || p.channel === "sms") && !!p.value);
  const sequences = sequencesFor(getConfig().industryId).map((s) => ({ id: s.id, name: s.name }));
  const showReachOut = canWrite && (canEmail || canText || sequences.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href="/leads" className="hover:text-fg">Leads</Link>
        <span>/</span>
        <span className="text-fg">{contact.name}</span>
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={contact.name} size={56} />
        <div>
          <h1 className="text-2xl font-semibold text-fg">{contact.name}</h1>
          <p className="text-sm text-muted">{[contact.title, contact.company].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xl font-semibold text-fg">{money(totalValue, deals[0]?.currency ?? "USD")}</div>
          <div className="text-xs text-muted">{deals.length} deal{deals.length === 1 ? "" : "s"}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          {showReachOut && (
            <Card title="Reach out">
              <ContactReachOut contactId={contact.id} canEmail={canEmail} canText={canText} sequences={sequences} />
            </Card>
          )}
          <Card title="Contact info">
            {contact.points.map((p, i) => (
              <InfoRow key={i} label={p.channel}>{p.value}</InfoRow>
            ))}
          </Card>
          {contact.attributes && Object.keys(contact.attributes).length > 0 && (
            <Card title="Attributes">
              {Object.entries(contact.attributes).map(([k, v]) => (
                <InfoRow key={k} label={k}>{String(v ?? "—")}</InfoRow>
              ))}
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Deals">
            {deals.length === 0 ? (
              <EmptyState iconName="pipeline" title="No deals" hint="Deals you create for this contact will appear here." />
            ) : (
              <ul className="space-y-2">
                {deals.map((d) => (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`} className="flex items-center justify-between rounded-lg border border-border bg-surface-2 p-3 transition hover:border-brand/50">
                      <span className="truncate text-sm text-fg">{d.title}</span>
                      <span className="text-sm tabular-nums text-brand">{money(d.value, d.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Activity">
            {activities.length === 0 ? (
              <EmptyState iconName="note" title="No activity yet" />
            ) : (
              <ol className="space-y-4">
                {activities.slice(0, 20).map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <ActivityIcon kind={a.kind} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm capitalize text-fg">{a.kind.replace("_", " ")}</span>
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
      </div>
    </div>
  );
}
