"use client";

import { isEuUkTimezone } from "@/lib/ads/region";
import type { AdsEventName } from "@/lib/ads/store";
import { decodeTouch, encodeTouch, isCampaignTouch, touchFromParams, type AdTouch, type Attribution } from "@/lib/ads/touch";

const FIRST = "rr_attr_first";
const LAST = "rr_attr_last";
const CONSENT = "rr_cookie_consent";

export interface AdsPublicConfig {
  metaPixelId: string;
  ga4Id: string;
  googleAdsId: string;
  labels: Partial<Record<AdsEventName, string>>;
}

declare global {
  interface Window {
    __rrAds?: AdsPublicConfig;
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function readStored(name: string): AdTouch | null {
  try {
    return decodeTouch(localStorage.getItem(name));
  } catch {
    return null;
  }
}

function writeStored(name: string, touch: AdTouch) {
  const raw = encodeTouch(touch);
  try {
    localStorage.setItem(name, raw);
  } catch {
    /* private mode */
  }
  document.cookie = `${name}=${raw}; Path=/; Max-Age=7776000; SameSite=Lax`;
}

export function captureVisit() {
  const params = new URLSearchParams(window.location.search);
  const touch = touchFromParams({
    params,
    referrer: document.referrer,
    landing: `${window.location.pathname}${window.location.search}`,
  });
  if (!readStored(FIRST)) writeStored(FIRST, touch);
  if (!readStored(LAST) || isCampaignTouch(touch)) writeStored(LAST, touch);
}

export function readAttributionClient(): Attribution {
  return { first: readStored(FIRST), last: readStored(LAST) };
}

export function adsConsentGranted(): boolean {
  try {
    const choice = localStorage.getItem(CONSENT);
    if (choice === "essential") return false;
    if (choice === "accepted") return true;
  } catch {
    return false;
  }
  try {
    return !isEuUkTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return false;
  }
}

function loadScript(src: string, id: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

let pixelsReady = false;

export function ensurePixels() {
  const cfg = window.__rrAds;
  if (!cfg || pixelsReady || !adsConsentGranted()) return;
  pixelsReady = true;
  if (cfg.metaPixelId && !window.fbq) {
    const queue: unknown[] = [];
    const fbq = ((...args: unknown[]) => {
      queue.push(args);
    }) as ((...args: unknown[]) => void) & { queue: unknown[]; loaded?: boolean; version?: string };
    fbq.queue = queue;
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    loadScript("https://connect.facebook.net/en_US/fbevents.js", "rr-meta-pixel");
    window.fbq("init", cfg.metaPixelId);
  }
  const tagId = cfg.ga4Id || cfg.googleAdsId;
  if (tagId && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function (...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag("js", new Date());
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`, "rr-gtag");
    if (cfg.ga4Id) window.gtag("config", cfg.ga4Id, { send_page_view: false });
    if (cfg.googleAdsId) window.gtag("config", cfg.googleAdsId);
  }
}

function firePixels(name: AdsEventName, eventId: string, value?: number, currency?: string) {
  ensurePixels();
  const cfg = window.__rrAds;
  if (!cfg || !adsConsentGranted()) return;
  window.fbq?.("track", name, value != null ? { value, currency: currency || "USD" } : {}, { eventID: eventId });
  const label = cfg.labels[name];
  if (cfg.googleAdsId && label && window.gtag && name !== "PageView" && name !== "ViewContent") {
    window.gtag("event", "conversion", {
      send_to: `${cfg.googleAdsId}/${label}`,
      value: value ?? 0,
      currency: currency || "USD",
      transaction_id: eventId,
    });
  }
  if (cfg.ga4Id && window.gtag) {
    const gaName = name === "PageView" ? "page_view" : name === "ViewContent" ? "view_item" : name === "Lead" ? "generate_lead" : name === "Purchase" ? "purchase" : name.toLowerCase();
    window.gtag("event", gaName, { event_id: eventId, value, currency: currency || "USD" });
  }
}

/** Browser half of a server event. Same event id dedupes Meta Pixel and CAPI. */
export function fireBrowserEvent(name: AdsEventName, eventId: string) {
  firePixels(name, eventId);
}

export async function trackInBrowser(name: AdsEventName, extra: { value?: number; currency?: string; email?: string; phone?: string; personName?: string } = {}) {
  captureVisit();
  const eventId = crypto.randomUUID();
  const consent = adsConsentGranted();
  if (consent) firePixels(name, eventId, extra.value, extra.currency);
  await fetch("/api/ads/collect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, eventId, attribution: readAttributionClient(), consent, page: window.location.href, fbp: readCookie("_fbp"), ...extra }),
    keepalive: true,
  }).catch(() => undefined);
}

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Server already stored the event. Fire only the browser pixel with the same id. */
export function flushServerPixel() {
  const raw = readCookie("rr_ads_pixel");
  if (!raw) return;
  document.cookie = "rr_ads_pixel=; Path=/; Max-Age=0";
  const [name, eventId] = raw.split(":");
  if (!eventId || !adsConsentGranted()) return;
  firePixels(name as AdsEventName, eventId);
}
