/**
 * Phone numbers — provider-agnostic, like comms and CRM. Two needs:
 *
 *   • Bring your own number — set OUTBOUND_FROM_NUMBER (used as the caller ID /
 *     "from" on outbound SMS and calls). Works with any transport.
 *   • Buy & manage numbers — register a NumberProvider in code, or point
 *     NUMBERS_WEBHOOK_URL at your telephony account / automation tool. The app
 *     POSTs {action:"search"|"buy"|"list", …}; you return the numbers. No vendor
 *     lock-in; buying happens through whatever provider you connect.
 *
 * Until something is connected, search/buy report "not configured" and the BYO
 * number (if any) is used for outbound.
 */

export interface PhoneNumber {
  number: string; // E.164, e.g. +15551234567
  label?: string;
  capabilities?: { sms?: boolean; voice?: boolean };
  status?: "owned" | "available";
  monthlyCostUsd?: number;
}

export interface NumberSearch {
  areaCode?: string;
  country?: string;
  contains?: string;
}

/** Webhooks to wire onto a number AT PURCHASE so it actually works the moment
 *  it's bought: inbound texts/calls route back to this org instead of dead-ending
 *  on a brand-new, unconfigured number. All optional — a number still buys (and
 *  works for outbound caller ID) if a public URL isn't configured yet. */
export interface NumberConfig {
  smsUrl?: string;
  voiceUrl?: string;
  statusCallback?: string;
}

export interface NumberProvider {
  id: string;
  available(): boolean;
  search(opts: NumberSearch): Promise<PhoneNumber[]>;
  buy(number: string, config?: NumberConfig): Promise<PhoneNumber>;
  listOwned(): Promise<PhoneNumber[]>;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/** The rep's own outbound caller-ID / from number, if they brought one. */
export function outboundFromNumber(): string | undefined {
  return env("OUTBOUND_FROM_NUMBER");
}

// ---- registry: bring your own provider (highest priority) ----
let custom: NumberProvider | null = null;
export function setNumberProvider(p: NumberProvider | null): void {
  custom = p;
}

async function postWebhook(action: string, payload: Record<string, unknown>): Promise<unknown> {
  const url = env("NUMBERS_WEBHOOK_URL")!;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = env("NUMBERS_WEBHOOK_TOKEN") ?? env("COMMS_WEBHOOK_TOKEN");
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
  if (!res.ok) throw new Error(`numbers webhook ${res.status}`);
  return res.json().catch(() => ({}));
}

const arr = (v: unknown): PhoneNumber[] => (Array.isArray(v) ? (v as PhoneNumber[]) : Array.isArray((v as { numbers?: unknown })?.numbers) ? ((v as { numbers: PhoneNumber[] }).numbers) : []);

const webhookProvider: NumberProvider = {
  id: "webhook",
  available: () => Boolean(env("NUMBERS_WEBHOOK_URL")),
  search: async (opts) => arr(await postWebhook("search", { ...opts })),
  buy: async (number, config) => {
    const r = (await postWebhook("buy", { number, ...(config ? { config } : {}) })) as PhoneNumber | { number?: string };
    return { number: r.number ?? number, status: "owned", ...r } as PhoneNumber;
  },
  listOwned: async () => arr(await postWebhook("list", {})),
};

// ---- built-in Twilio provider: search / buy / list your own numbers ----
// Uses the same TWILIO_ACCOUNT_SID/AUTH_TOKEN you set for calling, so numbers are
// fully self-serve in-app (Settings → Numbers) with no extra setup.
interface TwilioNumberRow {
  phone_number?: string;
  friendly_name?: string;
  capabilities?: { voice?: boolean; SMS?: boolean; sms?: boolean };
}

function twilioCreds(): { sid: string; token: string } | null {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  return sid && token ? { sid, token } : null;
}

async function twilioApi(path: string, form?: Record<string, string>): Promise<Record<string, unknown>> {
  const c = twilioCreds();
  if (!c) throw new Error("Twilio not configured");
  const auth = Buffer.from(`${c.sid}:${c.token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.sid}/${path}`, {
    method: form ? "POST" : "GET",
    headers: { Authorization: `Basic ${auth}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  if (!res.ok) throw new Error(`Twilio numbers API ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function mapTwilioRow(n: TwilioNumberRow, status: "owned" | "available"): PhoneNumber {
  return {
    number: n.phone_number ?? "",
    label: n.friendly_name,
    status,
    capabilities: { voice: Boolean(n.capabilities?.voice), sms: Boolean(n.capabilities?.SMS ?? n.capabilities?.sms) },
  };
}

const twilioProvider: NumberProvider = {
  id: "twilio",
  available: () => Boolean(twilioCreds()),
  search: async (opts) => {
    const country = (opts.country || "US").toUpperCase();
    const qs = new URLSearchParams({ VoiceEnabled: "true" });
    if (opts.areaCode) qs.set("AreaCode", opts.areaCode);
    if (opts.contains) qs.set("Contains", opts.contains);
    const data = await twilioApi(`AvailablePhoneNumbers/${country}/Local.json?${qs.toString()}`);
    return ((data.available_phone_numbers as TwilioNumberRow[]) ?? []).map((n) => mapTwilioRow(n, "available"));
  },
  buy: async (number, config) => {
    // Set the inbound webhooks AT PURCHASE so the number works immediately: texts
    // hit the org's inbound route and calls reach the voice handler. Twilio
    // accepts these on the create call — no second request, no race.
    const form: Record<string, string> = { PhoneNumber: number };
    if (config?.smsUrl) { form.SmsUrl = config.smsUrl; form.SmsMethod = "POST"; }
    if (config?.voiceUrl) { form.VoiceUrl = config.voiceUrl; form.VoiceMethod = "POST"; }
    if (config?.statusCallback) form.StatusCallback = config.statusCallback;
    const data = await twilioApi("IncomingPhoneNumbers.json", form);
    return mapTwilioRow(data as TwilioNumberRow, "owned");
  },
  listOwned: async () => {
    const data = await twilioApi("IncomingPhoneNumbers.json?PageSize=100");
    return ((data.incoming_phone_numbers as TwilioNumberRow[]) ?? []).map((n) => mapTwilioRow(n, "owned"));
  },
};

function resolve(): NumberProvider | null {
  if (custom && custom.available()) return custom;
  if (webhookProvider.available()) return webhookProvider;
  if (twilioProvider.available()) return twilioProvider;
  return null;
}

/** Is a number provider connected (so search/buy work)? */
export function numbersConfigured(): boolean {
  return resolve() !== null;
}

export function numbersProviderId(): string {
  return resolve()?.id ?? "none";
}

export async function searchNumbers(opts: NumberSearch): Promise<PhoneNumber[]> {
  const p = resolve();
  if (!p) throw new Error("No number provider connected. Set NUMBERS_WEBHOOK_URL or register a NumberProvider.");
  return p.search(opts);
}

export async function buyNumber(number: string, config?: NumberConfig): Promise<PhoneNumber> {
  const p = resolve();
  if (!p) throw new Error("No number provider connected.");
  return p.buy(number, config);
}

export async function listOwnedNumbers(): Promise<PhoneNumber[]> {
  const p = resolve();
  if (!p) {
    // No provider, but a BYO number still counts as "owned" for display/use.
    const byo = outboundFromNumber();
    return byo ? [{ number: byo, label: "Your number", status: "owned", capabilities: { sms: true, voice: true } }] : [];
  }
  return p.listOwned();
}
