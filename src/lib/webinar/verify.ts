import crypto from "node:crypto";
import { verifyHmacSignature } from "@/lib/webhook";
import { safeEqual } from "@/lib/safe-compare";
import { secretForProvider } from "@/lib/webinar/config";
import { publicSiteUrl } from "@/lib/site";
import { inboundOrgToken } from "@/lib/inbound-routing";

const MAX_SKEW_MS = 5 * 60_000;

export function zoomSignature(secret: string, timestamp: string, rawBody: string): string {
  const hash = crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  return `v0=${hash}`;
}

export function zoomEncryptedToken(secret: string, plainToken: string): string {
  return crypto.createHmac("sha256", secret).update(plainToken).digest("hex");
}

/** GoTo signs `timestamp:rawBody` with HMAC-SHA256 and base64-encodes it. */
export function gotoSignature(secret: string, timestamp: string, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("base64");
}

function header(headers: Headers, name: string): string | null {
  return headers.get(name);
}

/**
 * Authenticate a webinar webhook.
 *
 * Production fails closed: a shared secret must be set and the signature (or
 * the provider token query param, for platforms that cannot HMAC) must match.
 * Outside production, a missing secret allows local/demo traffic; a secret
 * that IS set is still enforced so tests can prove rejection.
 */
export function verifyWebinarRequest(input: {
  provider: string;
  rawBody: string;
  headers: Headers;
  url: URL;
  now?: Date;
}): { ok: true } | { ok: false; reason: string } {
  const provider = input.provider.toLowerCase();
  const secret = secretForProvider(provider);
  const production = process.env.NODE_ENV === "production";
  if (!secret) {
    return production ? { ok: false, reason: "secret_missing" } : { ok: true };
  }

  const token = input.url.searchParams.get("token");
  if (token && safeEqual(token, secret)) return { ok: true };

  if (provider === "zoom") {
    const ts = header(input.headers, "x-zm-request-timestamp") ?? "";
    const sig = header(input.headers, "x-zm-signature");
    const ms = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
    const now = input.now ?? new Date();
    if (!ts || !Number.isFinite(ms) || Math.abs(now.getTime() - ms) > MAX_SKEW_MS) {
      return { ok: false, reason: "stale_timestamp" };
    }
    const expected = zoomSignature(secret, ts, input.rawBody);
    if (!sig || !safeEqual(sig, expected)) return { ok: false, reason: "bad_signature" };
    return { ok: true };
  }

  if (provider === "goto" || provider === "gotowebinar") {
    const ts = header(input.headers, "x-webhook-signature-timestamp");
    const sig = header(input.headers, "x-webhook-signature");
    if (ts && sig) {
      const ms = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
      const now = input.now ?? new Date();
      if (!Number.isFinite(ms) || Math.abs(now.getTime() - ms) > MAX_SKEW_MS) return { ok: false, reason: "stale_timestamp" };
      const expected = gotoSignature(secret, ts, input.rawBody);
      if (!safeEqual(sig, expected)) return { ok: false, reason: "bad_signature" };
      return { ok: true };
    }
  }

  const sig =
    header(input.headers, "x-webinar-signature") ??
    header(input.headers, "x-demio-signature") ??
    header(input.headers, "x-webinarjam-signature") ??
    header(input.headers, "x-goto-signature") ??
    header(input.headers, "signature");
  if (!verifyHmacSignature(secret, input.rawBody, sig)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

/** Org-scoped webhook URL an operator pastes into Zoom / Demio / GoTo / a relay. */
export function webinarWebhookUrl(orgId: string, provider = "generic"): string | null {
  const base = publicSiteUrl();
  const token = inboundOrgToken(orgId);
  if (!base || !orgId || !token) return null;
  const q = new URLSearchParams({ org: orgId, t: token, provider });
  return `${base.replace(/\/$/, "")}/api/webinar/events?${q.toString()}`;
}
