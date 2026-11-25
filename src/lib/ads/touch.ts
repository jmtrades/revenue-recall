/**
 * First- and last-touch captured from a landing visit. Fields are clipped so a
 * cookie stays small. Nothing here calls the network.
 */

export const TOUCH_KEYS = ["source", "medium", "campaign", "content", "term", "fbclid", "gclid", "ttclid", "referrer", "landing", "at"] as const;

export interface AdTouch {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  fbclid: string;
  gclid: string;
  ttclid: string;
  referrer: string;
  landing: string;
  at: string;
}

export interface Attribution {
  first: AdTouch | null;
  last: AdTouch | null;
}

const CLIP = 160;

function clip(value: unknown): string {
  return String(value ?? "").trim().slice(0, CLIP);
}

function hostOf(referrer: string): string {
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function touchFromParams(input: {
  params: URLSearchParams;
  referrer?: string;
  landing?: string;
  at?: string;
}): AdTouch {
  const p = input.params;
  const referrer = clip(input.referrer);
  const source = clip(p.get("utm_source"));
  const medium = clip(p.get("utm_medium"));
  const campaign = clip(p.get("utm_campaign"));
  const content = clip(p.get("utm_content"));
  const term = clip(p.get("utm_term"));
  const fbclid = clip(p.get("fbclid"));
  const gclid = clip(p.get("gclid"));
  const ttclid = clip(p.get("ttclid"));
  const paid = Boolean(source || medium || campaign || content || term || fbclid || gclid || ttclid);
  return {
    source: source || (paid ? "" : hostOf(referrer) || "direct"),
    medium,
    campaign,
    content,
    term,
    fbclid,
    gclid,
    ttclid,
    referrer,
    landing: clip(input.landing),
    at: input.at || new Date().toISOString(),
  };
}

/** A visit that should replace last-touch. A bare direct hit does not. */
export function isCampaignTouch(touch: AdTouch): boolean {
  return Boolean(touch.campaign || touch.fbclid || touch.gclid || touch.ttclid || (touch.source && touch.source !== "direct" && touch.medium));
}

export function emptyTouch(): AdTouch {
  return { source: "", medium: "", campaign: "", content: "", term: "", fbclid: "", gclid: "", ttclid: "", referrer: "", landing: "", at: "" };
}

export function asTouch(value: unknown): AdTouch | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const touch = emptyTouch();
  for (const key of TOUCH_KEYS) touch[key] = clip(raw[key]);
  if (!touch.source && !touch.campaign && !touch.fbclid && !touch.gclid && !touch.ttclid && !touch.landing) return null;
  return touch;
}

export function asAttribution(value: unknown): Attribution {
  if (!value || typeof value !== "object") return { first: null, last: null };
  const raw = value as Record<string, unknown>;
  return { first: asTouch(raw.first), last: asTouch(raw.last) };
}

export function encodeTouch(touch: AdTouch): string {
  return encodeURIComponent(JSON.stringify(touch));
}

export function decodeTouch(raw: string | null | undefined): AdTouch | null {
  if (!raw) return null;
  try {
    return asTouch(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}

export function attributionFromCookie(header: string | null | undefined): Attribution {
  const jar = header ?? "";
  const pick = (name: string) => {
    const match = jar.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return decodeTouch(match?.[1]);
  };
  return { first: pick("rr_attr_first"), last: pick("rr_attr_last") };
}

/** Prefer an explicit payload, then the cookie. Last touch wins for reporting. */
export function resolveAttribution(explicit: unknown, cookieHeader: string | null | undefined): Attribution {
  const fromBody = asAttribution(explicit);
  const fromCookie = attributionFromCookie(cookieHeader);
  return {
    first: fromBody.first ?? fromCookie.first,
    last: fromBody.last ?? fromCookie.last,
  };
}

export function reportingTouch(attr: Attribution): AdTouch {
  return attr.last ?? attr.first ?? emptyTouch();
}

export function attributionNote(attr: Attribution): string {
  const t = reportingTouch(attr);
  if (!t.source && !t.campaign) return "";
  const bits = [t.source, t.medium, t.campaign, t.content].filter(Boolean);
  return bits.length ? `Ad: ${bits.join(" / ")}` : "";
}
