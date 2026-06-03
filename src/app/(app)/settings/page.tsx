import { getConfig } from "@/lib/config";
import { INDUSTRIES, getIndustry } from "@/lib/industries";
import { getLanguage } from "@/lib/languages";
import { listIntegrations, getProvider } from "@/lib/crm/registry";
import { isAiConfigured } from "@/lib/ai/client";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { channelStatus } from "@/lib/comms";
import { listConnections } from "@/lib/connections/store";
import { encryptionAvailable } from "@/lib/crypto";
import { ConnectionsManager } from "@/components/ConnectionsManager";
import { OAUTH_PROVIDERS, oauthConfigured, type OAuthPlatform } from "@/lib/connections/oauth";
import { complianceConfig } from "@/lib/compliance";
import { listOwnedNumbers, numbersConfigured, numbersProviderId, outboundFromNumber } from "@/lib/numbers";
import { SetupChecklist, type SetupItem } from "@/components/SetupChecklist";
import { getTeamAndPipeline } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { getActiveVoice } from "@/lib/voice";
import { pct } from "@/lib/format";
import { PageHeader, Card, Avatar, InfoRow } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { BillingReturnBanner } from "@/components/BillingReturnBanner";
import { OrgSettingsForm } from "@/components/OrgSettingsForm";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { BillingSettings } from "@/components/BillingSettings";
import { DataRights } from "@/components/DataRights";
import { NumbersManager } from "@/components/NumbersManager";
import { CallingStatus } from "@/components/CallingStatus";
import { TestSend } from "@/components/TestSend";
import { AiHealthCheck } from "@/components/AiHealthCheck";
import { VoiceStudio } from "@/components/VoiceStudio";
import { VoiceControls } from "@/components/VoiceControls";
import { CallVoicePicker } from "@/components/CallVoicePicker";
import { getSubscription } from "@/lib/billing/store";
import { billingConfigured, resolvePriceId, resolveTopupPriceId } from "@/lib/billing/stripe";
import { isAuthRequired } from "@/lib/config";
import { getPlan } from "@/lib/billing/plans";
import { TOPUP_PACKS } from "@/lib/billing/topups";
import { usageSummary, monthlyBudgetUsd, usageMeter } from "@/lib/ai/usage";
import { UsageMeter } from "@/components/UsageMeter";
import { NotificationSettings } from "@/components/NotificationSettings";
import { ImportCsv } from "@/components/ImportCsv";
import { TeamInvites } from "@/components/TeamInvites";
import { listInvites } from "@/lib/invites-server";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: { billing?: string; tab?: string; connected?: string } }) {
  const cfg = getConfig();
  const org = await getOrgSettings();
  const voice = await getActiveVoice();
  const active = getIndustry(org.industryId);

  const ch = channelStatus();
  // Per-org connections (sanitized: which fields are set, never secret values).
  const connections = (await listConnections().catch(() => [])).map((c) => ({
    provider: c.provider,
    connected: c.connected,
    setFields: [...Object.keys(c.secrets), ...Object.keys(c.config)],
  }));
  const encAvailable = encryptionAvailable();
  // Which social platforms have an OAuth app wired → show "Connect with…".
  const oauthProviders = (Object.keys(OAUTH_PROVIDERS) as OAuthPlatform[]).filter((p) => oauthConfigured(p));
  // Org-level compliance wins over env (multi-tenant identity).
  const compliance = complianceConfig({ orgName: org.compliance.senderName ?? org.name, address: org.compliance.address });
  // Billing prices may be auto-provisioned (resolved by lookup_key) or set via
  // env — resolve once so the checklist + top-up buttons reflect either.
  const billingOn = billingConfigured();
  const [growthPrice, teamPrice] = billingOn ? await Promise.all([resolvePriceId("growth"), resolvePriceId("team")]) : [undefined, undefined];
  const topupResolved = billingOn ? await Promise.all(TOPUP_PACKS.map((p) => resolveTopupPriceId(p.id))) : TOPUP_PACKS.map(() => undefined);
  const plansWired = Boolean(growthPrice && teamPrice);
  const topupsWired = topupResolved.some(Boolean);
  const setupItems: SetupItem[] = [
    {
      label: "Workspace database", ok: isSupabaseConfigured(), required: true, where: "Supabase + Vercel",
      detail: "Stores every account's data, privately. Already connected.",
      steps: ["Create a project at supabase.com", "Run the migrations in supabase/migrations", "Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in Vercel", "Redeploy"],
      link: { href: "https://supabase.com/dashboard", label: "Open Supabase" },
    },
    {
      label: "Private per-user accounts", ok: isAuthRequired(), required: true, where: "Automatic",
      detail: "Every user gets their own isolated workspace — turns on automatically once a database is connected.",
      steps: ["Connect the database above; sign-in then becomes required automatically (nothing to set)"],
    },
    {
      label: "Account provisioning key", ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), required: true, where: "Vercel",
      detail: "Lets a brand-new sign-up get their own workspace created. Without it, signups can't be provisioned.",
      steps: ["Supabase → Settings → API → copy the service_role key", "Add it as SUPABASE_SERVICE_ROLE_KEY in Vercel", "Redeploy"],
    },
    {
      label: "Email sending", ok: ch.email.live, required: true, where: "Resend + Vercel",
      detail: "So signup confirmations, invites, and outreach actually send instead of just logging.",
      steps: ["Create a Resend account and verify your sending domain", "Add RESEND_API_KEY and EMAIL_FROM in Vercel", "Redeploy"],
      link: { href: "https://resend.com", label: "Open Resend" },
    },
    {
      label: "Compliance address", ok: Boolean(compliance.address), required: true, where: "Settings → General",
      detail: "A real postal address is legally required on commercial email (CAN-SPAM).",
      steps: ["Open Settings → General", "Enter your business name and postal address", "Save"],
    },
    {
      label: "Self-serve connections (encryption)", ok: encAvailable, required: false, where: "Vercel",
      detail: "Unlocks the in-app Connect buttons so each user links their own CRM, database, and social accounts (stored encrypted).",
      steps: ["Generate a random key, e.g. openssl rand -base64 32", "Add it as ENCRYPTION_KEY in Vercel (keep it stable)", "Redeploy"],
    },
    {
      label: "Live AI writing", ok: isAiConfigured(), required: false, where: "Vercel",
      detail: "Writes outreach live in each user's voice. Until connected, polished templates are used.",
      steps: ["Get an API key at console.anthropic.com", "Add it as ANTHROPIC_API_KEY in Vercel", "Redeploy"],
      link: { href: "https://console.anthropic.com", label: "Open Anthropic" },
    },
    {
      label: "Billing — charge customers", ok: billingOn, required: false, where: "Stripe + Vercel",
      detail: "Turns on self-serve checkout, the customer portal, and usage top-ups.",
      steps: ["Add STRIPE_SECRET_KEY (Stripe → Developers → API keys)", "Add a webhook to /api/billing/webhook and paste STRIPE_WEBHOOK_SECRET", "Add STRIPE_PUBLISHABLE_KEY so checkout runs on your own domain", "Redeploy"],
      link: { href: "https://dashboard.stripe.com", label: "Open Stripe" },
    },
    {
      label: "Plans & top-ups auto-created", ok: plansWired && topupsWired, required: false, where: "One command",
      detail: "Creates every plan, annual, and top-up price in your Stripe for you — no dashboard work, no price IDs to paste.",
      steps: ["After STRIPE_SECRET_KEY is set, run once:", "curl -X POST https://recall-touch.com/api/billing/setup -H \"Authorization: Bearer $ADMIN_TOKEN\"", "Prices wire themselves automatically (lookup keys)"],
    },
    {
      label: "SMS & calls", ok: ch.sms.live, required: false, where: "Twilio + Vercel",
      detail: "Send real texts and run the power dialer (optional — email works on its own).",
      steps: ["Create a Twilio account and get a number", "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in Vercel", "Redeploy"],
      link: { href: "https://console.twilio.com", label: "Open Twilio" },
    },
    {
      label: "Autopilot", ok: process.env.SEQUENCE_AUTOPILOT === "true" || process.env.REPLY_AUTOPILOT === "true", required: false, where: "Vercel",
      detail: "Let it send sequences and replies hands-off (takes effect once a channel above is connected).",
      steps: ["Set SEQUENCE_AUTOPILOT=true and REPLY_AUTOPILOT=true in Vercel", "Redeploy"],
    },
    {
      label: "Scheduled runs", ok: Boolean(process.env.CRON_SECRET), required: false, where: "Vercel",
      detail: "Secures the daily autopilot job (Vercel Cron is already scheduled).",
      steps: ["Set CRON_SECRET to a random string in Vercel", "Redeploy"],
    },
  ];
  const setupTab = (
    <Card>
      <SetupChecklist items={setupItems} />
    </Card>
  );
  const voiceTab = (
    <>
      <VoiceStudio initial={voice} persisted={org.persisted} />
      <Card className="mt-4">
        <VoiceControls />
        <CallVoicePicker initialVoiceId={org.voiceId ?? null} />
      </Card>
    </>
  );
  const integrations = listIntegrations();
  const { users, pipeline } = await getTeamAndPipeline();
  const subscription = await getSubscription();
  const aiUsage = await usageSummary();
  // Customer-facing action meter (sanitize Infinity — it can't cross to a client component).
  const meter = await usageMeter();
  const usageProps = {
    used: meter.used,
    credits: meter.credits,
    unlimited: meter.unlimited,
    included: Number.isFinite(meter.included) ? meter.included : 0,
    limit: Number.isFinite(meter.limit) ? meter.limit : 0,
    remaining: Number.isFinite(meter.remaining) ? meter.remaining : 0,
    fraction: meter.fraction,
  };
  const topupPacks = TOPUP_PACKS.map((p, i) => ({ id: p.id, label: p.label, actions: p.actions, suggestedUsd: p.suggestedUsd, blurb: p.blurb, featured: Boolean(p.featured), purchasable: Boolean(topupResolved[i]) }));
  const aiBudget = monthlyBudgetUsd();

  const general = (
    <Card>
      <OrgSettingsForm
        initialName={org.name}
        initialQuota={org.monthlyQuota}
        initialLanguage={org.language}
        initialSenderName={org.compliance.senderName ?? ""}
        initialAddress={org.compliance.address ?? ""}
        persisted={org.persisted}
      />
      <div className="mt-5 border-t border-border pt-4">
        <InfoRow label="Industry">{active.label}</InfoRow>
        <InfoRow label="Language">{getLanguage(org.language).label}</InfoRow>
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

      <div className="mt-6 border-t border-border pt-5">
        <h2 className="font-semibold text-fg">Connect your database</h2>
        <p className="mt-1 text-sm text-muted">
          Bring your own data even if it isn&apos;t a normal CRM — Postgres, Airtable, a spreadsheet, a warehouse view.
          Connect it here (encrypted at rest) and we map your columns automatically.
        </p>
        <div className="mt-4">
          <ConnectionsManager initial={connections} encryptionAvailable={encAvailable} kind="database" />
        </div>
      </div>
    </Card>
  );

  const invites = await listInvites();
  const teamTab = (
    <Card>
      <p className="stat-label">Members</p>
      <ul className="mt-2 divide-y divide-border">
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
      <div className="mt-5 border-t border-border pt-5">
        <TeamInvites initial={invites} persisted={org.persisted} />
      </div>
    </Card>
  );

  const channels = ch;
  const channelsTab = (
    <>
      <Card>
        <p className="mb-3 text-sm text-muted">
          How outbound email, SMS, and calls are delivered. Connect your own sending — no lock-in. Until a channel is
          connected, messages are recorded to the timeline so every flow works end-to-end.
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
        <TestSend />
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold text-fg">Calling gateway</h2>
        <p className="mt-1 text-sm text-muted">
          A live check that outbound AI calls are wired end to end — it pings your gateway, so a wrong or down URL shows red instead of a false green.
        </p>
        <div className="mt-4">
          <CallingStatus />
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold text-fg">Social channels</h2>
        <p className="mt-1 text-sm text-muted">
          One inbox for every platform. Connect your own account below — credentials are encrypted at rest — and inbound DMs flow
          into your unified inbox; replies go back out on the same channel. Then point each platform&apos;s webhook at{" "}
          <code className="text-fg">/api/social/&lt;platform&gt;</code>.
        </p>
        <div className="mt-4">
          <ConnectionsManager initial={connections} encryptionAvailable={encAvailable} kind="social" oauthProviders={oauthProviders} />
        </div>
      </Card>
    </>
  );

  const ownedNumbers = await listOwnedNumbers().catch(() => []);
  const numbersTab = (
    <Card>
      <p className="mb-3 text-sm text-muted">
        Use your own number as the caller ID on outbound SMS and calls, or connect your telephony to search and buy new
        ones right here — no lock-in.
      </p>
      <NumbersManager
        configured={numbersConfigured()}
        provider={numbersProviderId()}
        byoNumber={outboundFromNumber() ?? null}
        initialOwned={ownedNumbers}
        initialCallerId={org.callerId ?? null}
      />
    </Card>
  );

  const notificationsTab = (
    <Card>
      <NotificationSettings initial={org.notificationPrefs} persisted={org.persisted} />
    </Card>
  );

  const billingTab = (
    <div className="space-y-4">
    <Card>
      <BillingSettings
        configured={billingConfigured()}
        plan={subscription.plan}
        status={subscription.status}
        seats={Math.max(subscription.seats, users.length)}
        currentPeriodEnd={subscription.currentPeriodEnd}
        hasCustomer={Boolean(subscription.stripeCustomerId)}
      />
      <div className="mt-4">
        <UsageMeter meter={usageProps} topups={topupPacks} billingConfigured={billingConfigured()} planName={getPlan(subscription.plan).name} />
      </div>
      <div className="mt-4 rounded-lg border border-border p-4">
        <p className="text-sm font-medium text-fg">AI usage this month <span className="text-xs font-normal text-muted">(cost &amp; margin)</span></p>
        <p className="mt-0.5 text-xs text-muted">Live drafting/brief/voice cost. Margin guard auto-falls back to free templates if a budget is hit.</p>
        <div className="mt-3">
          <InfoRow label="Cost">${aiUsage.costUsd.toFixed(2)}{aiBudget > 0 ? ` / $${aiBudget.toFixed(0)} budget` : " (no cap set)"}</InfoRow>
          <InfoRow label="AI messages">{aiUsage.calls.toLocaleString()}</InfoRow>
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
      <AiHealthCheck />
    </Card>
    <DataRights />
    </div>
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

  const billingReturn = searchParams.billing === "success" ? "success" : searchParams.billing === "cancelled" ? "cancelled" : null;
  const oauthReturn = searchParams.connected; // success | denied | error, from the OAuth callback

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Organization, industry profile, pipeline, integrations, and team." />
      {billingReturn && <BillingReturnBanner status={billingReturn} />}
      {oauthReturn === "success" && (
        <div className="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-success">Channel connected. Inbound messages will now flow into your inbox.</div>
      )}
      {oauthReturn === "denied" && (
        <div className="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">Connection cancelled — you didn&apos;t approve access. You can try again anytime.</div>
      )}
      {oauthReturn === "error" && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">We couldn&apos;t complete that connection. Please try again, or connect with keys.</div>
      )}
      <Tabs
        initial={billingReturn ? "billing" : searchParams.tab}
        tabs={[
          { id: "setup", label: "Setup", content: setupTab },
          { id: "general", label: "General", content: general },
          { id: "appearance", label: "Appearance", content: appearanceTab },
          { id: "voice", label: "Voice", content: voiceTab },
          { id: "industry", label: "Industry", content: industryTab },
          { id: "pipeline", label: "Pipeline", content: pipelineTab },
          { id: "integrations", label: "Integrations", content: integrationsTab },
          { id: "channels", label: "Channels", content: channelsTab },
          { id: "numbers", label: "Numbers", content: numbersTab },
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
