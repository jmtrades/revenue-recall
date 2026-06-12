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

import { appendEmailCompliance, appendSmsCompliance, complianceConfig } from "@/lib/compliance";
import { brandedEmailHtml } from "@/lib/email-brand";

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

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  from?: string;
  /** Optional branded HTML alternative (product mail only). The plaintext
   *  `body` is always sent too and remains the source of truth. */
  html?: string;
}
export interface SmsMessage {
  to: string;
  body: string;
  /** Caller ID — this org's own "from" number, so every org texts from their
   *  own number; falls back to OUTBOUND_FROM_NUMBER / TWILIO_FROM_NUMBER. */
  from?: string;
}
export interface VoiceCall {
  to: string;
  /** Caller ID — this org's own "from" number. Lets every org call from their
   *  own number; falls back to OUTBOUND_FROM_NUMBER when absent. */
  from?: string;
  /** Who/what the call is about — fed to the in-house agent's brain so it talks
   *  like it knows the prospect (ignored by transports that don't run our agent). */
  context?: string;
  /** Neural-voice id to speak in (e.g. a rep's cloned voice). */
  voiceId?: string;
  /** Personalized opening line. */
  opener?: string;
  /** A short spoken voicemail to leave if the call reaches an answering machine.
   *  Carried in the gateway payload; spoken when machine-detection signals voicemail. */
  voicemail?: string;
  /** Opaque per-call metadata (e.g. contactId/dealId) the gateway echoes back to
   *  /api/calls/log so the transcript attaches to the right record. */
  meta?: Record<string, string>;
}

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

// The default placeholder from earlier scaffolding — sending from it (an
// unverified domain) bounces or lands in spam, so it must never be used live.
const PLACEHOLDER_FROM = "sales@example.com";

/** A real, configured sender address — EMAIL_FROM that isn't the placeholder. */
export function configuredEmailFrom(): string | undefined {
  const v = env("EMAIL_FROM");
  return v && v !== PLACEHOLDER_FROM ? v : undefined;
}

const resendEmail: EmailTransport = {
  // Needs BOTH the API key AND a real from-address: sending from an unverified
  // domain just bounces, so without a configured EMAIL_FROM email is NOT "live"
  // (it falls through to logging) rather than silently failing every send.
  id: "resend",
  available: () => Boolean(env("RESEND_API_KEY")) && Boolean(configuredEmailFrom()),
  async send({ to, subject, body, from, html }) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: from ?? configuredEmailFrom(), to, subject, text: body, ...(html ? { html } : {}) }),
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
  available: () => Boolean(env("SENDGRID_API_KEY")) && Boolean(configuredEmailFrom()),
  async send({ to, subject, body, from, html }) {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("SENDGRID_API_KEY")}`, "Content-Type": "application/json" },
        // SendGrid requires text/plain before text/html in the content array.
        body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: from ?? configuredEmailFrom() }, subject, content: [{ type: "text/plain", value: body }, ...(html ? [{ type: "text/html", value: html }] : [])] }),
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
  async send({ to, subject, body, from, html }) {
    try {
      const r = await postWebhook(env("EMAIL_WEBHOOK_URL")!, { channel: "email", to, subject, body, from: from ?? configuredEmailFrom(), ...(html ? { html } : {}) });
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
  async send({ to, body, from }) {
    try {
      const r = await postWebhook(env("SMS_WEBHOOK_URL")!, { channel: "sms", to, body, from: from ?? env("OUTBOUND_FROM_NUMBER") });
      return { id: r.id ?? "webhook", status: "sent", provider: "webhook" };
    } catch (e) {
      return { id: "", status: "failed", provider: "webhook", detail: e instanceof Error ? e.message : "send failed" };
    }
  },
};

const twilioSms: SmsTransport = {
  id: "twilio",
  available: twilioReady,
  async send({ to, body, from }) {
    try {
      // Per-org caller ID wins; TWILIO_FROM_NUMBER is the platform fallback
      // (guaranteed present by twilioReady()).
      const r = await twilioRequest("Messages.json", { To: to, From: from || env("TWILIO_FROM_NUMBER")!, Body: body });
      return { id: r.sid ?? "twilio", status: "queued", provider: "twilio" };
    } catch (e) {
      return { id: "", status: "failed", provider: "twilio", detail: e instanceof Error ? e.message : "send failed" };
    }
  },
};

const webhookVoice: VoiceTransport = {
  id: "webhook",
  available: () => Boolean(env("VOICE_WEBHOOK_URL")),
  async place({ to, from, context, voiceId, opener, voicemail, meta }) {
    try {
      // Undefined fields are dropped by JSON.stringify, so this stays compatible
      // with any gateway; our in-house call-gateway uses context/voiceId/opener/voicemail/meta.
      const r = await postWebhook(env("VOICE_WEBHOOK_URL")!, { channel: "voice", to, from: from ?? env("OUTBOUND_FROM_NUMBER"), context, voiceId, opener, voicemail, meta });
      return { id: r.id ?? "webhook", status: "queued", provider: "webhook" };
    } catch (e) {
      return { id: "", status: "failed", provider: "webhook", detail: e instanceof Error ? e.message : "call failed" };
    }
  },
};

const twilioVoice: VoiceTransport = {
  id: "twilio",
  available: twilioReady,
  async place({ to, from }) {
    try {
      // Per-org caller ID wins; TWILIO_FROM_NUMBER is the platform fallback — so
      // every org dials from THEIR own number, matching the SMS path (and the
      // documented promise), not one shared line.
      const r = await twilioRequest("Calls.json", { To: to, From: from || env("TWILIO_FROM_NUMBER")!, Url: env("CALL_TWIML_URL") ?? "http://demo.twilio.com/docs/voice.xml" });
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

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  opts?: { unsubscribeUrl?: string | null; compliance?: { orgName?: string; address?: string }; internal?: boolean; cta?: { label: string; url: string } },
): Promise<SendResult> {
  const t = resolveEmail();
  // Compliance footer (unsubscribe + per-org address) applied at the single send
  // boundary, so every outbound path is covered regardless of who composed it.
  // Internal product mail (digests, reminders) isn't commercial outreach: no
  // CAN-SPAM footer, and definitely not the prospect-facing 'Reply "unsubscribe"'
  // line, which on an internal digest is a reply that does nothing.
  const cfg = complianceConfig(opts?.compliance);
  // CAN-SPAM §7(a) requires a physical postal address on every commercial email
  // — it is not optional, so in production a live transport refuses to send
  // without one rather than quietly mailing non-compliant outreach.
  // COMPLIANCE_REQUIRE_ADDRESS=false relaxes this for operators who add the
  // address upstream (e.g. in their email gateway).
  if (!opts?.internal && cfg.enabled && !cfg.address && t && process.env.NODE_ENV === "production" && process.env.COMPLIANCE_REQUIRE_ADDRESS !== "false") {
    return {
      id: "",
      status: "failed",
      provider: "compliance",
      detail: "CAN-SPAM requires your business postal address on outreach email. Set it in Settings → General (or COMPLIANCE_ADDRESS) and resend.",
    };
  }
  const compliant = opts?.internal ? body : appendEmailCompliance(body, opts?.unsubscribeUrl, cfg);
  // Product mail (internal) ships a branded HTML alternative alongside the text
  // part, with an optional prominent CTA button. Prospect outreach stays
  // plaintext-only on purpose: a personal email in the rep's voice must not look
  // like a campaign.
  const html = opts?.internal ? brandedEmailHtml({ subject, body: compliant, cta: opts?.cta }) : undefined;
  return t ? t.send({ to, subject, body: compliant, html }) : logResult();
}

export async function sendSms(to: string, body: string, opts: { from?: string } = {}): Promise<SendResult> {
  const t = resolveSms();
  const compliant = appendSmsCompliance(body);
  return t ? t.send({ to, body: compliant, from: opts.from }) : logResult();
}

/** Place an outbound call via the resolved voice transport, else log it.
 *  `opts` (context/voiceId/opener) is passed to the in-house agent gateway so
 *  the AI knows who it's calling and why; transports that don't run our agent
 *  simply ignore it. */
export async function placeCall(to: string, opts: { from?: string; context?: string; voiceId?: string; opener?: string; voicemail?: string; meta?: Record<string, string> } = {}): Promise<SendResult> {
  const t = resolveVoice();
  return t ? t.place({ to, ...opts }) : logResult();
}
