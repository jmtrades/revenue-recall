/**
 * Communications layer. A single abstraction over email, SMS, and voice with
 * real provider adapters (Resend/SendGrid for email, Twilio for SMS + voice).
 *
 * With no provider env configured, every channel uses the "log" transport: the
 * message is recorded to the deal/contact timeline instead of being sent, so
 * the whole flow works end-to-end in the demo and goes live the moment you set
 * provider credentials. Nothing upstream changes.
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

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function emailProvider(): string {
  if (env("RESEND_API_KEY")) return "resend";
  if (env("SENDGRID_API_KEY")) return "sendgrid";
  return "log";
}

function twilioReady(): boolean {
  return Boolean(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM_NUMBER"));
}

export function channelStatus(): ChannelStatus {
  return {
    email: { provider: emailProvider(), live: emailProvider() !== "log" },
    sms: { provider: twilioReady() ? "twilio" : "log", live: twilioReady() },
    voice: { provider: twilioReady() ? "twilio" : "log", live: twilioReady() },
  };
}

async function twilioRequest(path: string, form: Record<string, string>): Promise<{ sid?: string; status?: string; message?: string }> {
  const sid = env("TWILIO_ACCOUNT_SID")!;
  const token = env("TWILIO_AUTH_TOKEN")!;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.message as string) ?? `Twilio ${res.status}`);
  return { sid: json.sid as string, status: json.status as string };
}

export async function sendEmail(to: string, subject: string, body: string): Promise<SendResult> {
  const provider = emailProvider();
  const from = env("EMAIL_FROM") ?? "sales@example.com";
  try {
    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text: body }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) throw new Error(json.message ?? `Resend ${res.status}`);
      return { id: json.id ?? "resend", status: "sent", provider };
    }
    if (provider === "sendgrid") {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("SENDGRID_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from },
          subject,
          content: [{ type: "text/plain", value: body }],
        }),
      });
      if (!res.ok) throw new Error(`SendGrid ${res.status}`);
      return { id: res.headers.get("x-message-id") ?? "sendgrid", status: "sent", provider };
    }
  } catch (e) {
    return { id: "", status: "failed", provider, detail: e instanceof Error ? e.message : "send failed" };
  }
  return { id: `log_${Date.now()}`, status: "logged", provider: "log" };
}

export async function sendSms(to: string, body: string): Promise<SendResult> {
  if (!twilioReady()) return { id: `log_${Date.now()}`, status: "logged", provider: "log" };
  try {
    const r = await twilioRequest("Messages.json", { To: to, From: env("TWILIO_FROM_NUMBER")!, Body: body });
    return { id: r.sid ?? "twilio", status: "queued", provider: "twilio" };
  } catch (e) {
    return { id: "", status: "failed", provider: "twilio", detail: e instanceof Error ? e.message : "send failed" };
  }
}

/**
 * Place an outbound call. With Twilio configured this dials the prospect and
 * connects them to the rep / a TwiML script (CALL_TWIML_URL). Without it, the
 * call is logged as initiated so the dialer flow is fully exercisable.
 */
export async function placeCall(to: string): Promise<SendResult> {
  if (!twilioReady()) return { id: `log_${Date.now()}`, status: "logged", provider: "log" };
  const twiml = env("CALL_TWIML_URL") ?? "http://demo.twilio.com/docs/voice.xml";
  try {
    const r = await twilioRequest("Calls.json", { To: to, From: env("TWILIO_FROM_NUMBER")!, Url: twiml });
    return { id: r.sid ?? "twilio", status: "queued", provider: "twilio" };
  } catch (e) {
    return { id: "", status: "failed", provider: "twilio", detail: e instanceof Error ? e.message : "call failed" };
  }
}
