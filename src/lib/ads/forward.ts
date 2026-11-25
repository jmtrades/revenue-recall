import type { AdsEventName } from "@/lib/ads/store";
import { hashEmail, hashName, hashPhone } from "@/lib/ads/hash";
import type { AdTouch } from "@/lib/ads/touch";

export type ForwardStatus = "sent" | "skipped" | "error";

const GA4_NAME: Record<AdsEventName, string> = {
  PageView: "page_view",
  ViewContent: "view_item",
  Lead: "generate_lead",
  Contact: "contact",
  Schedule: "schedule",
  Purchase: "purchase",
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function adsConfig() {
  return {
    metaPixelId: env("META_PIXEL_ID"),
    metaToken: env("META_CAPI_TOKEN"),
    metaTestCode: env("META_TEST_EVENT_CODE"),
    ga4Id: env("GA4_ID"),
    ga4Secret: env("GA4_API_SECRET"),
    googleAdsId: env("GOOGLE_ADS_ID"),
    labels: {
      Lead: env("GOOGLE_ADS_LABEL_LEAD"),
      Contact: env("GOOGLE_ADS_LABEL_CONTACT"),
      Schedule: env("GOOGLE_ADS_LABEL_SCHEDULE"),
      Purchase: env("GOOGLE_ADS_LABEL_PURCHASE"),
    } as Partial<Record<AdsEventName, string>>,
  };
}

export interface ForwardInput {
  name: AdsEventName;
  eventId: string;
  at: string;
  page?: string;
  touch: AdTouch;
  email?: string;
  phone?: string;
  nameOfPerson?: string;
  value?: number;
  currency?: string;
  ip?: string;
  userAgent?: string;
  fbp?: string;
  test?: boolean;
}

/** POST one event to Meta's Conversions API. No-op without a pixel id and token. */
export async function sendMeta(input: ForwardInput, fetchImpl: typeof fetch = fetch): Promise<ForwardStatus> {
  const cfg = adsConfig();
  if (!cfg.metaPixelId || !cfg.metaToken) return "skipped";
  const user_data: Record<string, string> = {};
  const em = hashEmail(input.email);
  const ph = hashPhone(input.phone);
  const names = hashName(input.nameOfPerson);
  if (em) user_data.em = em;
  if (ph) user_data.ph = ph;
  if (names.fn) user_data.fn = names.fn;
  if (names.ln) user_data.ln = names.ln;
  if (input.ip) user_data.client_ip_address = input.ip;
  if (input.userAgent) user_data.client_user_agent = input.userAgent;
  if (input.fbp) user_data.fbp = input.fbp;
  if (input.touch.fbclid) user_data.fbc = `fb.1.${Date.parse(input.at) || Date.now()}.${input.touch.fbclid}`;
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: input.name,
        event_time: Math.floor((Date.parse(input.at) || Date.now()) / 1000),
        event_id: input.eventId,
        action_source: "website",
        event_source_url: input.page || input.touch.landing || undefined,
        user_data,
        custom_data: {
          currency: (input.currency || "USD").toUpperCase(),
          ...(input.value != null ? { value: input.value } : {}),
          ...(input.touch.campaign ? { content_name: input.touch.campaign } : {}),
        },
      },
    ],
  };
  if (input.test && cfg.metaTestCode) body.test_event_code = cfg.metaTestCode;
  try {
    const res = await fetchImpl(`https://graph.facebook.com/v21.0/${cfg.metaPixelId}/events?access_token=${encodeURIComponent(cfg.metaToken)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok ? "sent" : "error";
  } catch {
    return "error";
  }
}

/** POST one event to GA4 Measurement Protocol. No-op without a measurement id and secret. */
export async function sendGa4(input: ForwardInput, fetchImpl: typeof fetch = fetch): Promise<ForwardStatus> {
  const cfg = adsConfig();
  if (!cfg.ga4Id || !cfg.ga4Secret) return "skipped";
  const clientId = input.eventId.replace(/-/g, "").slice(0, 20) || "revenue-recall";
  const params: Record<string, unknown> = {
    engagement_time_msec: 1,
    session_id: clientId,
    event_id: input.eventId,
    source: input.touch.source || undefined,
    medium: input.touch.medium || undefined,
    campaign: input.touch.campaign || undefined,
    content: input.touch.content || undefined,
    term: input.touch.term || undefined,
    page_location: input.page || input.touch.landing || undefined,
  };
  if (input.value != null) {
    params.value = input.value;
    params.currency = (input.currency || "USD").toUpperCase();
  }
  try {
    const res = await fetchImpl(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(cfg.ga4Id)}&api_secret=${encodeURIComponent(cfg.ga4Secret)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, events: [{ name: GA4_NAME[input.name], params }] }),
    });
    return res.ok ? "sent" : "error";
  } catch {
    return "error";
  }
}

export interface SchedulePayload {
  email?: string;
  name?: string;
  phone?: string;
  start?: string;
}

function dict(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Calendly invitee.created and Cal.com BOOKING_CREATED. Anything else is ignored. */
export function parseScheduleWebhook(body: unknown): SchedulePayload | null {
  const root = dict(body);
  if (!root) return null;
  const event = str(root.event) ?? str(root.triggerEvent);
  const payload = dict(root.payload) ?? root;
  if (event === "invitee.created") {
    return { email: str(payload.email), name: str(payload.name), phone: str(payload.text_reminder_number), start: str(dict(payload.scheduled_event)?.start_time) };
  }
  if (event === "BOOKING_CREATED") {
    const attendees = Array.isArray(payload.attendees) ? payload.attendees : [];
    const first = dict(attendees[0]);
    return { email: str(first?.email), name: str(first?.name), phone: str(first?.phoneNumber), start: str(payload.startTime) };
  }
  return null;
}
