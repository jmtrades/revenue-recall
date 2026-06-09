/**
 * What each connectable provider needs from the user, shared by the connect API
 * (validation) and the connect UI (form fields). Keeps the two in lockstep so a
 * field can never be requested but not stored, or stored but not collectable.
 *
 * `secret: true` fields are encrypted at rest; non-secret fields (labels,
 * account ids, mapping, version) live in plain config. `accountRefKey` names the
 * field whose value is the platform account id used to route inbound webhooks.
 */
export interface FieldSpec {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  help?: string;
}

export interface ProviderSpec {
  provider: string;
  kind: "social" | "database" | "crm";
  label: string;
  /** Short note on what to paste / where it comes from. */
  blurb: string;
  /** True when the platform needs developer app approval before it can be used. */
  gated?: boolean;
  /** Field whose value is the inbound-webhook account id (for routing). */
  accountRefKey?: string;
  fields: FieldSpec[];
}

export const CONNECTION_SPECS: ProviderSpec[] = [
  {
    provider: "telegram",
    kind: "social",
    label: "Telegram",
    blurb: "Create a bot with @BotFather and paste its token. Works instantly — no app review.",
    fields: [
      { key: "token", label: "Bot token", secret: true, required: true, placeholder: "123456:ABC-DEF…" },
      { key: "webhookSecret", label: "Webhook secret (optional)", secret: true, required: false, help: "A secret you set when registering the webhook; we verify it on inbound." },
    ],
  },
  {
    provider: "whatsapp",
    kind: "social",
    label: "WhatsApp Business",
    blurb: "From Meta Cloud API: your access token + phone number id. Set the app secret to verify inbound.",
    accountRefKey: "phoneNumberId",
    fields: [
      { key: "token", label: "Access token", secret: true, required: true },
      { key: "phoneNumberId", label: "Phone number ID", secret: false, required: true, help: "Routes inbound messages to this workspace." },
      { key: "appSecret", label: "App secret", secret: true, required: false },
      { key: "verifyToken", label: "Verify token", secret: true, required: false, help: "The token you enter in Meta's webhook setup." },
    ],
  },
  {
    provider: "instagram",
    kind: "social",
    label: "Instagram DMs",
    blurb: "Meta page/IG access token. Set the app secret + verify token for inbound webhooks.",
    accountRefKey: "accountId",
    fields: [
      { key: "token", label: "Access token", secret: true, required: true },
      { key: "accountId", label: "IG account / page ID", secret: false, required: false, help: "Routes inbound to this workspace." },
      { key: "appSecret", label: "App secret", secret: true, required: false },
      { key: "verifyToken", label: "Verify token", secret: true, required: false },
    ],
  },
  {
    provider: "messenger",
    kind: "social",
    label: "Facebook Messenger",
    blurb: "Meta page access token. Set the app secret + verify token for inbound webhooks.",
    accountRefKey: "accountId",
    fields: [
      { key: "token", label: "Page access token", secret: true, required: true },
      { key: "accountId", label: "Page ID", secret: false, required: false, help: "Routes inbound to this workspace." },
      { key: "appSecret", label: "App secret", secret: true, required: false },
      { key: "verifyToken", label: "Verify token", secret: true, required: false },
    ],
  },
  {
    provider: "x",
    kind: "social",
    label: "X (Twitter) DMs",
    blurb: "Needs elevated X API access. Paste your bearer token; the API secret enables inbound + CRC.",
    gated: true,
    fields: [
      { key: "token", label: "Bearer token", secret: true, required: true },
      { key: "apiSecret", label: "API secret", secret: true, required: false },
    ],
  },
  {
    provider: "linkedin",
    kind: "social",
    label: "LinkedIn",
    blurb: "Partner-gated. Paste an access token with an approved messaging scope (send-only for now).",
    gated: true,
    fields: [
      { key: "token", label: "Access token", secret: true, required: true },
      { key: "apiVersion", label: "API version (optional)", secret: false, required: false, placeholder: "202401" },
    ],
  },
  {
    provider: "database",
    kind: "database",
    label: "Connected database",
    blurb: "Any endpoint returning lead rows as JSON — PostgREST, Supabase REST, Airtable, NocoDB, Sheets-as-JSON.",
    fields: [
      { key: "url", label: "Data source URL", secret: true, required: true, placeholder: "https://…/leads" },
      { key: "token", label: "Bearer token (optional)", secret: true, required: false },
      { key: "mapping", label: "Column mapping (optional JSON)", secret: false, required: false, placeholder: '{"name":"full_name","email":"email_address"}', help: "Map your columns → name/email/phone/company/value/stage. Auto-detected if omitted." },
    ],
  },
  // ——— CRMs: connect the org's own CRM as the workspace data source. Stored
  // per-org (secrets encrypted); resolveProvider() activates it for the tenant.
  {
    provider: "close",
    kind: "crm",
    label: "Close",
    blurb: "Your Close API key (Settings → API Keys in Close). Leads, deals, and activity sync both ways.",
    fields: [{ key: "apiKey", label: "API key", secret: true, required: true, placeholder: "api_…" }],
  },
  {
    provider: "hubspot",
    kind: "crm",
    label: "HubSpot",
    blurb: "A private-app access token (HubSpot → Settings → Integrations → Private apps) with CRM read/write scopes.",
    fields: [{ key: "accessToken", label: "Private app token", secret: true, required: true, placeholder: "pat-…" }],
  },
  {
    provider: "pipedrive",
    kind: "crm",
    label: "Pipedrive",
    blurb: "Your personal API token (Pipedrive → Personal preferences → API).",
    fields: [
      { key: "apiToken", label: "API token", secret: true, required: true },
      { key: "apiBase", label: "API base URL (optional)", secret: false, required: false, placeholder: "https://yourco.pipedrive.com/api/v1", help: "Only needed for a company-domain API base." },
    ],
  },
  {
    provider: "salesforce",
    kind: "crm",
    label: "Salesforce",
    blurb: "An access token + your instance URL. Tokens are short-lived — for long-lived self-hosted setups use the env refresh-token flow instead.",
    fields: [
      { key: "accessToken", label: "Access token", secret: true, required: true },
      { key: "instanceUrl", label: "Instance URL", secret: false, required: true, placeholder: "https://yourco.my.salesforce.com" },
    ],
  },
];

export function getProviderSpec(provider: string): ProviderSpec | undefined {
  return CONNECTION_SPECS.find((s) => s.provider === provider);
}
