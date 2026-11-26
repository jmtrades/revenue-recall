import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { listCampaigns, listSetterRuns } from "@/lib/offers/store";
import { hydrateRemoteStore } from "@/lib/free/db";
import { getSessionRole } from "@/lib/authz";
import { isAuthRequired } from "@/lib/config";
import { ApproveButton } from "@/components/offers/ApproveButton";

export const metadata = { title: "Offers — Revenue Recall" };
export const dynamic = "force-dynamic";

export default async function OffersAdminPage() {
  const role = await getSessionRole();
  if (isAuthRequired() && role !== "owner" && role !== "admin") redirect("/dashboard");
  await hydrateRemoteStore().catch(() => undefined);
  const runs = listSetterRuns();
  const campaigns = listCampaigns();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Offers" subtitle="Setter demos and reactivation drafts. A trial call that cannot be dialed is logged. Drafts do not send." />
      <Card title="Setter runs">
        {runs.length === 0 ? <p className="text-sm text-muted">No setter demos yet.</p> : (
          <ul className="space-y-2 text-sm">
            {runs.slice(0, 20).map((run) => (
              <li key={run.id} className="border-b border-border py-2">
                <span className="font-medium text-fg">{run.name}</span>
                <span className="text-muted"> · {run.triage} · call {run.call} · {run.reason}{run.test ? " · test" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-4" title="Reactivation drafts">
        {campaigns.length === 0 ? <p className="text-sm text-muted">No audits yet.</p> : (
          <ul className="space-y-3 text-sm">
            {campaigns.slice(0, 20).map((c) => (
              <li key={c.id} className="border-b border-border py-2">
                <p className="font-medium text-fg">{c.name} · {c.status}</p>
                <p className="text-muted">{c.estimate.unique} unique · {c.estimate.reachable} reachable · {c.estimate.reachableNow} outside quiet hours</p>
                {c.status === "draft" ? <ApproveButton id={c.id} /> : <p className="text-muted">Approved. Still not sent.</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-sm"><Link href="/admin" className="text-brand hover:underline">Back to admin</Link></p>
    </div>
  );
}
