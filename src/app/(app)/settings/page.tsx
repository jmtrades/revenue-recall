import { getConfig } from "@/lib/config";
import { INDUSTRIES, getIndustry } from "@/lib/industries";
import { listIntegrations, getProvider } from "@/lib/crm/registry";
import { isAiConfigured } from "@/lib/ai/client";
import { channelStatus } from "@/lib/comms";
import { getTeamAndPipeline } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { getActiveVoice } from "@/lib/voice";
import { pct } from "@/lib/format";
import { PageHeader, Card, Avatar, InfoRow } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { OrgSettingsForm } from "@/components/OrgSettingsForm";
import { VoiceStudio } from "@/components/VoiceStudio";
import { BillingActions } from "@/components/BillingActions";
import { CsvImport } from "@/components/CsvImport";
import { getUsageSnapshot } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cfg = getConfig();
  const org = await getOrgSettings();
  const voice = await getActiveVoice();
  const active = getIndustry(org.industryId);
  const voiceTab = <VoiceStudio initial={voice} persisted={org.persisted} />;
  const integrations = listIntegrations();
  const { users, pipeline } = await getTeamAndPipeline();
  const usage = await getUsageSnapshot();
  const activeProvider = getProvider().info();
  const explicit = cfg.providerId !== "auto";
  const providerFellBack = explicit && cfg.providerId !== activeProvider.id;

  const general = (
    <Card>
      <OrgSettingsForm initialName={org.name} initialQuota={org.monthlyQuota} persisted={org.persisted} />
      <div className="mt-5 border-t border-border pt-4">
        <InfoRow label="Industry">{active.label}</InfoRow>
        <InfoRow label="Currency">{org.currency}</InfoRow>
        <InfoRow label="Active CRM">
          {activeProvider.label}
          {providerFellBack && (
            <span className="ml-2 pill bg-warn/15 text-warn">
              {cfg.providerId} not configured — using {activeProvider.label}
            </span>
          )}
        </InfoRow>
        <InfoRow label="AI assistant">
          <span className={`pill ${isAiConfigured() ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>
            {isAiConfigured() ? "Connected" : "Template fallback"}
          </span>
        </InfoRow>
        <InfoRow label="Storage">{org.persisted ? "Database" : "In-memory / env"}</InfoRow>
      </div>
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

  const channels = channelStatus();
  const channelsTab = (
    <Card>
      <p className="mb-3 text-sm text-muted">
        How outbound email, SMS, and calls are delivered. Until a provider is configured, messages are recorded to the
        timeline so every flow works end-to-end. Configure via env (Resend/SendGrid for email, Twilio for SMS &amp; voice).
      </p>
      <ul className="divide-y divide-border">
        {([
          ["Email", channels.email],
          ["SMS", channels.sms],
          ["Voice / Calls", channels.voice],
        ] as const).map(([label, c]) => (
          <li key={label} className="flex items-center justify-between py-3">
            <div>
              <span className="text-sm font-medium text-white">{label}</span>
              <div className="mt-1 text-xs text-muted">Provider: {c.provider}</div>
            </div>
            <span className={`pill ${c.live ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>{c.live ? "Live" : "Logging only"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );

  const notifFlags = [
    { label: "New lead assigned to me", on: true },
    { label: "Deal flagged by Revenue Recall", on: true },
    { label: "Deal stage changes", on: false },
    { label: "Daily pipeline digest (email)", on: true },
    { label: "Task reminders", on: true },
  ];
  const notificationsTab = (
    <Card>
      <ul className="divide-y divide-border">
        {notifFlags.map((n) => (
          <li key={n.label} className="flex items-center justify-between py-3">
            <span className="text-sm text-white">{n.label}</span>
            <span className={`relative h-6 w-11 rounded-full ${n.on ? "bg-success" : "bg-surface-2"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white ${n.on ? "left-[22px]" : "left-0.5"}`} />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Delivery channels connect at launch.</p>
    </Card>
  );

  const planName = usage?.plan ?? "Starter";
  const aiUsed = usage?.used ?? 0;
  const aiIncluded = usage?.included ?? 50;
  const aiPct = aiIncluded > 0 ? Math.min(100, Math.round((aiUsed / aiIncluded) * 100)) : 0;

  const billingTab = (
    <Card>
      <div className="rounded-lg border border-brand/40 bg-brand-soft/20 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">{planName} plan</p>
            <p className="text-xs text-muted">Pipelines, automations, recall, and metered AI.</p>
          </div>
          <span className="pill bg-brand text-white">Current</span>
        </div>
      </div>
      <div className="mt-2">
        <InfoRow label="Seats">{users.length} active</InfoRow>
        <InfoRow label="AI actions this month">{aiUsed.toLocaleString()} / {aiIncluded.toLocaleString()}</InfoRow>
        {usage && usage.credits > 0 && <InfoRow label="AI credits">{usage.credits.toLocaleString()}</InfoRow>}
        <InfoRow label="Billing cycle">Monthly</InfoRow>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${aiPct >= 100 ? "bg-danger" : aiPct >= 80 ? "bg-warn" : "bg-brand"}`} style={{ width: `${aiPct}%` }} />
      </div>
      <BillingActions />
      <p className="mt-4 text-xs text-muted">
        Calls &amp; SMS are billed as usage credits at near cost. AI actions beyond your plan are available as credits.
      </p>
    </Card>
  );

  const importTab = (
    <Card>
      <p className="text-sm text-muted">No CRM yet? Import your contacts from a CSV to get started instantly.</p>
      <div className="mt-4">
        <CsvImport />
      </div>
      <p className="mt-3 text-xs text-muted">
        Contacts are added to your active workspace ({getProvider().info().label}). Deals import is coming next.
      </p>
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
          { id: "voice", label: "Voice", content: voiceTab },
          { id: "industry", label: "Industry", content: industryTab },
          { id: "pipeline", label: "Pipeline", content: pipelineTab },
          { id: "integrations", label: "Integrations", content: integrationsTab },
          { id: "channels", label: "Channels", content: channelsTab },
          { id: "team", label: "Team", content: teamTab },
          { id: "fields", label: "Fields", content: fieldsTab },
          { id: "notifications", label: "Notifications", content: notificationsTab },
          { id: "import", label: "Import", content: importTab },
          { id: "billing", label: "Billing", content: billingTab },
        ]}
      />
    </div>
  );
}
