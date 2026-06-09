import crypto from "node:crypto";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { safeEqual } from "@/lib/safe-compare";

/**
 * Click tracking for outbound links. At send time, http(s) URLs in a message
 * are rewritten to a signed redirect (/api/t?d=…) that records the click and
 * 302s to the destination. The token signs the DESTINATION too, so the
 * endpoint can never be used as an open redirect. Open-pixel tracking is
 * deliberately not implemented — outreach is plain-text by design.
 */

export interface ClickContext {
  orgId?: string;
  contactId?: string;
  dealId?: string;
  channel?: "email" | "sms";
}

interface ClickPayload extends ClickContext {
  u: string; // destination URL
}

function secret(): string | null {
  const real = process.env.ENCRYPTION_KEY || process.env.CRON_SECRET;
  if (real) return real;
  return process.env.NODE_ENV === "production" ? null : "rr-tracking-dev";
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function sign(data: string, s: string): string {
  return crypto.createHmac("sha256", s).update(data).digest("hex").slice(0, 20);
}

/** A signed /api/t token for one destination URL, or null when unconfigured. */
export function clickToken(url: string, ctx: ClickContext): string | null {
  const s = secret();
  if (!s) return null;
  const payload = b64url(JSON.stringify({ u: url, orgId: ctx.orgId, contactId: ctx.contactId, dealId: ctx.dealId, channel: ctx.channel } satisfies ClickPayload));
  return `${payload}.${sign(payload, s)}`;
}

/** Verify + decode a token. Null on tamper/garbage — never throws. */
export function verifyClickToken(token: string): ClickPayload | null {
  const s = secret();
  if (!s) return null;
  const [payload, sig] = (token ?? "").split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload, s))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ClickPayload;
    return typeof parsed.u === "string" && /^https?:\/\//i.test(parsed.u) ? parsed : null;
  } catch {
    return null;
  }
}

const URL_RE = /https?:\/\/[^\s<>()"']+/g;

/**
 * Rewrite every http(s) link in an outbound body to the tracked redirect.
 * No-ops (returns the body unchanged) without a public site URL or signing
 * secret, and never rewrites our own /api/ links (unsubscribe, forms, …).
 */
export function trackLinks(body: string, ctx: ClickContext): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base || !secret()) return body;
  const origin = base.replace(/\/$/, "");
  return body.replace(URL_RE, (url) => {
    if (url.startsWith(`${origin}/api/`)) return url; // our own machine links stay direct
    const token = clickToken(url, ctx);
    return token ? `${origin}/api/t?d=${token}` : url;
  });
}

/** Record a verified click (best-effort; the redirect must never fail on it). */
export async function recordClick(p: ClickPayload): Promise<void> {
  try {
    const client = getSupabase();
    if (!client || !p.orgId) return;
    await client.from("message_events").insert({
      org_id: p.orgId,
      kind: "click",
      channel: p.channel ?? null,
      contact_id: p.contactId ?? null,
      deal_id: p.dealId ?? null,
      url: p.u,
    });
  } catch {
    /* best-effort */
  }
}

export interface ClickStats {
  total30d: number;
  topUrls: { url: string; count: number }[];
}

/** The org's click engagement over the last 30 days. Never throws. */
export async function clickStats(): Promise<ClickStats> {
  const empty: ClickStats = { total30d: 0, topUrls: [] };
  try {
    if (!isSupabaseConfigured()) return empty;
    const orgId = await resolveActiveOrgId();
    if (!orgId) return empty;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data, error } = await getSupabase()!
      .from("message_events")
      .select("url")
      .eq("org_id", orgId)
      .eq("kind", "click")
      .gte("created_at", since)
      .limit(2000);
    if (error) return empty;
    const rows = (data as { url: string }[] | null) ?? [];
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.url, (counts.get(r.url) ?? 0) + 1);
    const topUrls = [...counts.entries()].map(([url, count]) => ({ url, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    return { total30d: rows.length, topUrls };
  } catch {
    return empty;
  }
}
