import { getConfig } from "@/lib/config";
import { INDUSTRIES, getIndustry } from "@/lib/industries";
import { listIntegrations } from "@/lib/crm/registry";
import { getTeamAndPipeline } from "@/lib/queries";
import { money, pct } from "@/lib/format";
import { PageHeader, Card, Avatar, InfoRow } from "@/components/ui";
import { Tabs } from "@/components/Tabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cfg = getConfig();
  const active = getIndustry(cfg.industryId);
  const integrations = listIntegrations();
  const { users, pipeline } = await getTeamAndPipeline();

  const general = (
    <Card>
      <InfoRow label="Organization">{cfg.orgName}</InfoRow>
      <InfoRow label="Industry">{active.label}</InfoRow>
      <InfoRow label="Currency">{active.currency}</InfoRow>
      <InfoRow label="Monthly quota">{money(cfg.monthlyQuota, active.currency)}</InfoRow>
      <InfoRow label="Active CRM">{cfg.providerId}</InfoRow>
      <p className="mt-4 text-xs text-muted">
        These are configured via environment variables (<code className="text-brand">NEXT_PUBLIC_ORG_NAME</code>,{" "}
        <code className="text-brand">NEXT_PUBLIC_INDUSTRY</code>, <code className="text-brand">NEXT_PUBLIC_MONTHLY_QUOTA</code>,{" "}
        <code className="text-brand">CRM_PROVIDER</code>). Editable in-app once a database is wired.
      </p>
    </Card>
  );

  const industryTab = (
    <Card>
      <p className="mb-4 text-sm text-muted">
        Sets terminology (<em>{active.terminology.contact}</em> / <em>{active.terminology.opportunity}</em> / <em>{active.terminology.value}</em>),
        the default pipeline, and custom fields. Switch with <code className="text-brand">NEXT_PUBLIC_INDUSTRY</code>.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {INDUSTRIES.map((ind) => (
          <div key={ind.id} className={`rounded-lg border p-3 ${ind.id === cfg.industryId ? "border-brand bg-brand-soft/30" : "border-border bg-surface-2"}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{ind.label}</span>
              {ind.id === cfg.industryId && <span className="pill bg-brand text-white">Active</span>}
            </div>
            <p className="mt-1 text-xs text-muted">{ind.blurb}</p>
            <code className="mt-2 block text-[11px] text-muted">{ind.id}</code>
          </div>
        ))}
      </div>
    </Card>
  );

  const pipelineTab = (
    <Card title={pipeline.label}>
      <ul className="space-y-2">
        {pipeline.stages.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2">
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${s.type === "won" ? "bg-success" : s.type === "lost" ? "bg-danger" : "bg-brand"}`} />
              <span className="text-sm text-white">{s.label}</span>
              <span className="pill bg-surface text-muted">{s.type}</span>
            </span>
            <span className="text-xs tabular-nums text-muted">{pct(s.probability)} win</span>
          </li>
        ))}
      </ul>
    </Card>
  );

  const integrationsTab = (
    <Card>
      <p className="mb-3 text-sm text-muted">
        Active: <span className="text-white">{cfg.providerId}</span>. Set <code className="text-brand">CRM_PROVIDER</code> to switch.
        Unconfigured providers fall back to the built-in CRM automatically.
      </p>
      <ul className="divide-y divide-border">
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
            <span className={`pill ${p.ready ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>{p.ready ? "Ready" : "Not configured"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );

  const teamTab = (
    <Card>
      <ul className="divide-y divide-border">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 py-3">
            <Avatar name={u.name} size={36} />
            <div>
              <div className="text-sm font-medium text-white">{u.name}</div>
              <div className="text-xs text-muted">{u.email ?? "—"}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );

  const fieldsTab = (
    <Card>
      {active.fields.length === 0 ? (
        <p className="text-sm text-muted">No custom fields for this industry.</p>
      ) : (
        <ul className="divide-y divide-border">
          {active.fields.map((f) => (
            <li key={f.key} className="flex items-center justify-between py-3">
              <div>
                <span className="text-sm text-white">{f.label}</span>
                <code className="ml-2 text-xs text-muted">{f.key}</code>
              </div>
              <span className="pill bg-surface-2 text-muted">{f.type}{f.options ? ` · ${f.options.length} options` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Organization, industry profile, pipeline, integrations, and team." />
      <Tabs
        tabs={[
          { id: "general", label: "General", content: general },
          { id: "industry", label: "Industry", content: industryTab },
          { id: "pipeline", label: "Pipeline", content: pipelineTab },
          { id: "integrations", label: "Integrations", content: integrationsTab },
          { id: "team", label: "Team", content: teamTab },
          { id: "fields", label: "Fields", content: fieldsTab },
        ]}
      />
    </div>
  );
}
