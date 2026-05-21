import { getConfig } from "@/lib/config";
import { INDUSTRIES, getIndustry } from "@/lib/industries";
import { listIntegrations } from "@/lib/crm/registry";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const cfg = getConfig();
  const active = getIndustry(cfg.industryId);
  const integrations = listIntegrations();

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Industry profile and CRM connections." />

      <section className="card mb-6">
        <h2 className="font-semibold text-white">Industry</h2>
        <p className="mt-1 text-sm text-muted">
          Active: <span className="text-white">{active.label}</span>. This sets your terminology
          (<em>{active.terminology.contact}</em> / <em>{active.terminology.opportunity}</em> / <em>{active.terminology.value}</em>),
          default pipeline, and fields. Change it with the <code className="text-brand">NEXT_PUBLIC_INDUSTRY</code> env var.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {INDUSTRIES.map((ind) => (
            <div
              key={ind.id}
              className={`rounded-lg border p-3 ${ind.id === cfg.industryId ? "border-brand bg-brand-soft/30" : "border-border bg-surface-2"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{ind.label}</span>
                {ind.id === cfg.industryId && <span className="pill bg-brand text-white">Active</span>}
              </div>
              <p className="mt-1 text-xs text-muted">{ind.blurb}</p>
              <code className="mt-2 block text-[11px] text-muted">{ind.id}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold text-white">CRM Integrations</h2>
        <p className="mt-1 text-sm text-muted">
          Active provider: <span className="text-white">{cfg.providerId}</span>. Set <code className="text-brand">CRM_PROVIDER</code> to switch.
          Unconfigured providers fall back to the built-in CRM automatically.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {integrations.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3">
              <div>
                <span className="text-sm font-medium text-white">{p.label}</span>
                <div className="mt-1 flex gap-1.5">
                  {p.capabilities.read && <span className="pill bg-surface-2 text-muted">read</span>}
                  {p.capabilities.write && <span className="pill bg-surface-2 text-muted">write</span>}
                  {p.capabilities.activities && <span className="pill bg-surface-2 text-muted">activities</span>}
                </div>
              </div>
              <span className={`pill ${p.ready ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>
                {p.ready ? "Ready" : "Not configured"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
