import { randomUUID } from "node:crypto";
import { sendGa4, sendMeta, type ForwardStatus } from "@/lib/ads/forward";
import { hashEmail } from "@/lib/ads/hash";
import { putEvent, touchForEmail, type AdsEventName, type StoredEvent } from "@/lib/ads/store";
import { emptyTouch, reportingTouch, type AdTouch, type Attribution } from "@/lib/ads/touch";

const CONVERSIONS = new Set<AdsEventName>(["Lead", "Schedule", "Purchase"]);

export interface TrackInput {
  name: AdsEventName;
  eventId?: string;
  attribution?: Attribution;
  page?: string;
  email?: string;
  phone?: string;
  personName?: string;
  value?: number;
  currency?: string;
  ip?: string;
  userAgent?: string;
  fbp?: string;
  /** Browser said the visitor accepted advertising cookies. */
  consent?: boolean;
  test?: boolean;
}

export interface TrackResult {
  ok: true;
  eventId: string;
  duplicate: boolean;
  forwarded: { meta: ForwardStatus; ga4: ForwardStatus };
}

function inherit(touch: AdTouch, email?: string): AdTouch {
  if (touch.campaign || touch.source) return touch;
  const prior = touchForEmail(hashEmail(email));
  if (!prior) return touch;
  return { ...touch, ...prior, at: touch.at || new Date().toISOString() };
}

/**
 * Store one funnel event and, when keys exist, forward it to Meta and GA4
 * with the same event id the browser used. Page views wait for consent.
 * A lead, booking, or sale is forwarded because the person completed that step.
 */
export async function trackAds(input: TrackInput): Promise<TrackResult> {
  const eventId = input.eventId?.trim() || randomUUID();
  const at = new Date().toISOString();
  const touch = inherit(reportingTouch(input.attribution ?? { first: null, last: null }), input.email);
  const row: StoredEvent = {
    id: eventId,
    name: input.name,
    at,
    source: touch.source,
    medium: touch.medium,
    campaign: touch.campaign,
    content: touch.content,
    term: touch.term,
    landing: touch.landing || input.page || "",
    emailHash: hashEmail(input.email),
    value: input.value,
    currency: input.currency?.toUpperCase(),
    test: input.test,
  };
  const saved = putEvent(row);
  if (saved.duplicate) return { ok: true, eventId, duplicate: true, forwarded: { meta: "skipped", ga4: "skipped" } };

  const allowed = input.test || input.consent === true || CONVERSIONS.has(input.name);
  if (!allowed) return { ok: true, eventId, duplicate: false, forwarded: { meta: "skipped", ga4: "skipped" } };

  const forward = {
    name: input.name,
    eventId,
    at,
    page: input.page,
    touch: touch.source || touch.campaign ? touch : { ...emptyTouch(), ...touch },
    email: input.email,
    phone: input.phone,
    nameOfPerson: input.personName,
    value: input.value,
    currency: input.currency,
    ip: input.ip,
    userAgent: input.userAgent,
    fbp: input.fbp,
    test: input.test,
  };
  const [meta, ga4] = await Promise.all([sendMeta(forward), sendGa4(forward)]);
  return { ok: true, eventId, duplicate: false, forwarded: { meta, ga4 } };
}
