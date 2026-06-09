import { PageHeader } from "@/components/ui";
import { ApprovalsView, type ApprovalRow } from "@/components/ApprovalsView";
import { listOutbox } from "@/lib/agent/store";
import { resolveProvider } from "@/lib/crm/registry";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const [items, contacts] = await Promise.all([
    listOutbox("pending").catch(() => []),
    (await resolveProvider()).listContacts().catch(() => []),
  ]);
  const nameById = new Map(contacts.map((c) => [c.id, c.name]));
  const rows: ApprovalRow[] = items.map((i) => ({
    id: i.id,
    contactName: i.contactId ? nameById.get(i.contactId) ?? "Contact" : "Contact",
    dealId: i.dealId,
    channel: i.channel,
    subject: i.subject,
    body: i.body,
    source: i.source,
  }));

  return (
    <div>
      <PageHeader title="Approvals" subtitle="AI-drafted outreach from review-mode Autopilot tasks. Approve to send, or dismiss." />
      <ApprovalsView rows={rows} />
    </div>
  );
}
