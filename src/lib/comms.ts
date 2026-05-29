/**
 * Communications layer — provider-agnostic, like the CRM layer. Email, SMS, and
 * voice each resolve a transport in this order:
 *
 *   1. a transport you register in code (setEmailTransport/…)         ← bring your own
 *   2. a generic webhook (EMAIL_WEBHOOK_URL / SMS_WEBHOOK_URL / …)     ← connect anything, no code
 *   3. a built-in adapter if its keys are set (Resend, SendGrid, Twilio — all optional)
 *   4. the "log" transport: record to the timeline instead of sending  ← zero-config demo
 *
 * Nothing is required and nothing is locked to one vendor: point the webhook at
 * your own gateway / automation tool / provider, or implement a transport. The
 * whole app works end to end on the log fallback and goes live the moment you
 * connect a transport — no upstream changes.
 */

export type ChannelKind = "email" | "sms" | "voice";

export interface SendResult {
  id: string;
  status: "sent" | "queued" | "logged" | "failed";
  provider: string;
  detail?: string;
}

export interface ChannelStatus {
  email: { provider: string; live: boolean };
  sms: { provider: string; live: boolean };
  voice: { provider: string; live: boolean };
}

export interface EmailMessage { to: string; subject: string; body: string; from?: string }
export interface SmsMessage { to: string; body: string }
export interface VoiceCall { to: string }

export interface EmailTransport { id: string; available(): boolean; send(m: EmailMessage): Promise<SendResult> }
export interface SmsTransport { id: string; available(): boolean; send(m: SmsMessage): Promise<SendResult> }
export interface VoiceTransport { id: string; available(): boolean; place(c: VoiceCall): Promise<SendResult> }

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

// ---- registry: bring your own transport (highest priority) ----
let customEmail: EmailTransport | null = null;
let customSms: SmsTransport | null = null;
let customVoice: VoiceTransport | null = null;

export function setEmailTransport(t: EmailTransport | null): void { customEmail = t; }
export function setSmsTransport(t: SmsTransport | null): void { customSms = t; }
export function setVoiceTransport(t: VoiceTransport | null): void { customVoice = t; }

// ---- generic webhook: connect any provider with zero code ----
async function postWebhook(url: string, payload: Record<string, unknown>): Promise<{ id?: string; status?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = env("COMMS_WEBHOOK_TOKEN");
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? `webhook ${res.status}`);
  return { id: json.id, status: json.status };
}

const logResult = (): SendResult => ({ id: `log_${Date.now()}`, status: "logged", provider: "log" });

// ---- built-in email transports ----
const resendEmail: EmailTransport = {
  id: "resend",
  available: () => Boolean(env("RESEND_API_KEY")),
  async send({ to, subject, body, from }) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: from ?? env("EMAIL_FROM") ?? "sales@example.com", to, subject, text: body }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) throw new Error(json.message ?? `Resend ${res.status}`);
      return { id: json.id ?? "resend", status: "sent", provider: "resend" };
    } catch (e) {
      return { id: "", status: "failed", provider: "resend", detail: e instanceof Error ? e.message : "send failed" };
    }
  },
};

const sendgridEmail: EmailTransport = {
  id: "sendgrid",
  available: () => Boolean(env("SENDGRID_API_KEY")),
  async send({ to, subject, body, from }) {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("SENDGRID_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: from ?? env("EMAIL_FROM") ?? "sales@example.com" }, subject, content: [{ type: "text/plain", value: body }] }),
      });
      if (!res.ok) throw new Error(`SendGrid ${res.status}`);
      return { id: res.headers.get("x-message-id") ?? "sendgrid", status: "sent", provider: "sendgrid" };
    } catch (e) {
      return { id: "", status: "failed", provider: "sendgrid", detail: e instanceof Error ? e.message : "send failed" };
    }
  },
};

const webhookEmail: EmailTransport = {
  id: "webhook",
  available: () => Boolean(env("EMAIL_WEBHOOK_URL")),
  async send({ to, subject, body, from }) {
    try {
      const r = await postWebhook(env("EMAIL_WEBHOOK_URL")!, { channel: "email", to, subject, body, from: from ?? env("EMAIL_FROM") });
      return { id: r.id ?? "webhook", status: "sent", provider: "webhook" };
    } catch (e) {
      return { id: "", status: "failed", provider: "webhook", detail: e instanceof Error ? e.message : "send failed" };
    }
  },
};

// ---- built-in Twilio (optional) ----
function twilioReady(): boolean {
  return Boolean(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM_NUMBER"));
}
async function twilioRequest(path: string, form: Record<string, string>): Promise<{ sid?: string; status?: string }> {
  const sid = env("TWILIO_ACCOUNT_SID")!;
  const auth = Buffer.from(`${sid}:${env("TWILIO_AUTH_TOKEN")!}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.message as string) ?? `Twilio ${res.status}`);
  return { sid: json.sid as string, status: json.status as string };
}

const webhookSms: SmsTransport = {
  id: "webhook",
  available: () => Boolean(env("SMS_WEBHOOK_URL")),
  async send({ to, body }) {
    try {
      const r = await postWebhook(env("SMS_WEBHOOK_URL")!, { channel: "sms", to, body, from: env("OUTBOUND_FROM_NUMBER") });
      return { id: r.id ?? "webhook", status: "sent", provider: "webhook" };
    } catch (e) {
      return { id: "", status: "failed", provider: "webhook", detail: e instanceof Error ? e.message : "send failed" };
    }
  },
};

const twilioSms: SmsTransport = {
  id: "twilio",
  available: twilioReady,
  async send({ to, body }) {
    try {
      const r = await twilioRequest("Messages.json", { To: to, From: env("TWILIO_FROM_NUMBER")!, Body: body });
      return { id: r.sid ?? "twilio", status: "queued", provider: "twilio" };
    } catch (e) {
      return { id: "", status: "failed", provider: "twilio", detail: e instanceof Error ? e.message : "send failed" };
    }
  },
};

const webhookVoice: VoiceTransport = {
  id: "webhook",
  available: () => Boolean(env("VOICE_WEBHOOK_URL")),
  async place({ to }) {
    try {
      const r = await postWebhook(env("VOICE_WEBHOOK_URL")!, { channel: "voice", to, from: env("OUTBOUND_FROM_NUMBER") });
      return { id: r.id ?? "webhook", status: "queued", provider: "webhook" };
    } catch (e) {
      return { id: "", status: "failed", provider: "webhook", detail: e instanceof Error ? e.message : "call failed" };
    }
  },
};

const twilioVoice: VoiceTransport = {
  id: "twilio",
  available: twilioReady,
  async place({ to }) {
    try {
      const r = await twilioRequest("Calls.json", { To: to, From: env("TWILIO_FROM_NUMBER")!, Url: env("CALL_TWIML_URL") ?? "http://demo.twilio.com/docs/voice.xml" });
      return { id: r.sid ?? "twilio", status: "queued", provider: "twilio" };
    } catch (e) {
      return { id: "", status: "failed", provider: "twilio", detail: e instanceof Error ? e.message : "call failed" };
    }
  },
};

// ---- resolution (custom → webhook → built-in → log) ----
function resolveEmail(): EmailTransport | null {
  for (const t of [customEmail, webhookEmail, resendEmail, sendgridEmail]) if (t && t.available()) return t;
  return null;
}
function resolveSms(): SmsTransport | null {
  for (const t of [customSms, webhookSms, twilioSms]) if (t && t.available()) return t;
  return null;
}
function resolveVoice(): VoiceTransport | null {
  for (const t of [customVoice, webhookVoice, twilioVoice]) if (t && t.available()) return t;
  return null;
}

export function channelStatus(): ChannelStatus {
  const e = resolveEmail();
  const s = resolveSms();
  const v = resolveVoice();
  return {
    email: { provider: e?.id ?? "log", live: Boolean(e) },
    sms: { provider: s?.id ?? "log", live: Boolean(s) },
    voice: { provider: v?.id ?? "log", live: Boolean(v) },
  };
}

export async function sendEmail(to: string, subject: string, body: string): Promise<SendResult> {
  const t = resolveEmail();
  return t ? t.send({ to, subject, body }) : logResult();
}

export async function sendSms(to: string, body: string): Promise<SendResult> {
  const t = resolveSms();
  return t ? t.send({ to, body }) : logResult();
}

/** Place an outbound call via the resolved voice transport, else log it. */
export async function placeCall(to: string): Promise<SendResult> {
  const t = resolveVoice();
  return t ? t.place({ to }) : logResult();
}
