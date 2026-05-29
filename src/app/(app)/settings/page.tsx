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
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { BillingSettings } from "@/components/BillingSettings";
import { VoiceStudio } from "@/components/VoiceStudio";
import { VoiceControls } from "@/components/VoiceControls";
import { getSubscription } from "@/lib/billing/store";
import { billingConfigured } from "@/lib/billing/stripe";
import { usageSummary, monthlyBudgetUsd } from "@/lib/ai/usage";
import { NotificationSettings } from "@/components/NotificationSettings";
import { ImportCsv } from "@/components/ImportCsv";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cfg = getConfig();
  const org = await getOrgSettings();
  const voice = await getActiveVoice();
  const active = getIndustry(org.industryId);
  const voiceTab = (
    <>
      <VoiceStudio initial={voice} persisted={org.persisted} />
      <Card className="mt-4">
        <VoiceControls />
      </Card>
    </>
  );
  const integrations = listIntegrations();
  const { users, pipeline } = await getTeamAndPipeline();
  const subscription = await getSubscription();
  const aiUsage = await usageSummary();
  const aiBudget = monthlyBudgetUsd();

  const general = (
    <Card>
      <OrgSettingsForm initialName={org.name} initialQuota={org.monthlyQuota} persisted={org.persisted} />
      <div className="mt-5 border-t border-border pt-4">
        <InfoRow label="Industry">{active.label}</InfoRow>
        <InfoRow label="Currency">{org.currency}</InfoRow>
        <InfoRow label="Active CRM">{getProvider().info().label}</InfoRow>
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
              <span className="text-sm font-medium text-fg">{ind.label}</span>
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
              <span className="text-sm text-fg">{s.label}</span>
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
        Active: <span className="text-fg">{cfg.providerId}</span>. Set <code className="text-brand">CRM_PROVIDER</code> to switch.
        Unconfigured providers fall back to the built-in CRM automatically.
      </p>
      <ul className="divide-y divide-border">
        {integrations.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-3">
            <div>
              <span className="text-sm font-medium text-fg">{p.label}</span>
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
              <div className="text-sm font-medium text-fg">{u.name}</div>
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
              <span className="text-sm font-medium text-fg">{label}</span>
              <div className="mt-1 text-xs text-muted">Provider: {c.provider}</div>
            </div>
            <span className={`pill ${c.live ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>{c.live ? "Live" : "Logging only"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );

  const notificationsTab = (
    <Card>
      <NotificationSettings initial={org.notificationPrefs} persisted={org.persisted} />
    </Card>
  );

  const billingTab = (
    <Card>
      <BillingSettings
        configured={billingConfigured()}
        plan={subscription.plan}
        status={subscription.status}
        seats={Math.max(subscription.seats, users.length)}
        currentPeriodEnd={subscription.currentPeriodEnd}
        hasCustomer={Boolean(subscription.stripeCustomerId)}
      />
      <div className="mt-4 rounded-lg border border-border p-4">
        <p className="text-sm font-medium text-fg">AI usage this month</p>
        <p className="mt-0.5 text-xs text-muted">Live drafting/brief/voice cost. Margin guard auto-falls back to free templates if a budget is hit.</p>
        <div className="mt-3">
          <InfoRow label="Cost">${aiUsage.costUsd.toFixed(2)}{aiBudget > 0 ? ` / $${aiBudget.toFixed(0)} budget` : " (no cap set)"}</InfoRow>
          <InfoRow label="Calls">{aiUsage.calls.toLocaleString()}</InfoRow>
          <InfoRow label="Tokens">{(aiUsage.inputTokens + aiUsage.outputTokens).toLocaleString()}</InfoRow>
        </div>
        {Object.keys(aiUsage.byFeature).length > 0 && (
          <div className="mt-3 border-t border-border/60 pt-3">
            <p className="text-xs font-medium text-muted">By feature</p>
            <div className="mt-1 space-y-1">
              {Object.entries(aiUsage.byFeature)
                .sort((a, b) => b[1] - a[1])
                .map(([feature, cost]) => (
                  <div key={feature} className="flex items-center justify-between text-xs">
                    <span className="text-muted">{feature}</span>
                    <span className="tabular-nums text-fg">${cost.toFixed(2)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );

  const importTab = (
    <Card>
      <ImportCsv writable={getProvider().info().capabilities.write} />
    </Card>
  );

  const appearanceTab = (
    <Card>
      <AppearanceSettings initialAccent={org.theme.accent} initialMode={org.theme.mode} persisted={org.persisted} />
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
                <span className="text-sm text-fg">{f.label}</span>
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
          { id: "appearance", label: "Appearance", content: appearanceTab },
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
