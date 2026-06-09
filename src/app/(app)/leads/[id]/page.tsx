import Link from "next/link";
import { notFound } from "next/navigation";
import { getContactDetail } from "@/lib/queries";
import { resolveProvider } from "@/lib/crm/registry";
import { getConfig } from "@/lib/config";
import { allSequencesFor } from "@/lib/sequences-store";
import { money, relativeDays } from "@/lib/format";
import { Card, Avatar, InfoRow, ActivityIcon, EmptyState } from "@/components/ui";
import { ContactReachOut } from "@/components/ContactReachOut";
import { ContactInfoEdit } from "@/components/ContactInfoEdit";
import { DeleteButton } from "@/components/DeleteButton";

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
  const provider = (await resolveProvider());
  const canWrite = provider.info().capabilities.write;
  // Only offer delete once the contact has no deals — removing one would
  // otherwise orphan live pipeline records (the deal's contact link is nulled).
  const canDelete = canWrite && typeof provider.deleteContact === "function" && deals.length === 0;
  const canEmail = contact.points.some((p) => p.channel === "email" && !!p.value);
  const canText = contact.points.some((p) => (p.channel === "phone" || p.channel === "sms") && !!p.value);
  const email = contact.points.find((p) => p.channel === "email")?.value ?? "";
  const phone = contact.points.find((p) => p.channel === "phone" || p.channel === "sms")?.value ?? "";
  const sequences = (await allSequencesFor(getConfig().industryId)).map((s) => ({ id: s.id, name: s.name }));
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
            <ContactInfoEdit
              contactId={contact.id}
              points={contact.points}
              initial={{ name: contact.name, company: contact.company ?? "", title: contact.title ?? "", email, phone }}
              canWrite={canWrite}
            />
          </Card>
          {contact.attributes && Object.keys(contact.attributes).length > 0 && (
            <Card title="Attributes">
              {Object.entries(contact.attributes).map(([k, v]) => (
                <InfoRow key={k} label={k}>{String(v ?? "—")}</InfoRow>
              ))}
            </Card>
          )}
          {canDelete && (
            <Card title="Danger zone">
              <p className="mb-3 text-sm text-muted">Permanently remove this contact and their activity. This can&apos;t be undone — use it for junk or duplicate records.</p>
              <DeleteButton
                endpoint={`/api/contacts/${contact.id}`}
                label="Delete contact"
                confirmText={`Permanently delete ${contact.name}? Their activity history goes with them. This can't be undone.`}
                redirectTo="/leads"
              />
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
