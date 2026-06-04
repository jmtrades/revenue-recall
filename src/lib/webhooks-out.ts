import crypto from "node:crypto";
import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { assertSafeOutboundUrl, isSafeOutboundUrl } from "@/lib/net/ssrf-guard";
import { logError, errMessage } from "@/lib/log";

/**
 * Outbound webhooks: when an org configures an endpoint, the platform POSTs
 * events (lead.created, …) to it, signed with the org's secret (HMAC-SHA256 over
 * the exact body) so the receiver can verify authenticity. Delivery is SSRF-
 * guarded (a tenant can't point it at our own infra) and best-effort — a dead or
 * slow endpoint never breaks the action that emitted the event.
 */

const DELIVERY_TIMEOUT_MS = 3000;

export interface WebhookConfig {
  url: string;
  secret: string;
}

export function signWebhook(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Validate a customer-supplied webhook URL: https-only + not an internal host. */
export function isValidWebhookUrl(url: string): boolean {
  return /^https:\/\//i.test(url.trim()) && isSafeOutboundUrl(url.trim());
}

/** The current org's webhook config (url + secret), or null. */
export async function getWebhookConfig(): Promise<WebhookConfig | null> {
  const client = getSupabase();
  if (!client) return null;
  const orgId = await resolveActiveOrgId();
  if (!orgId) return null;
  const { data } = await client.from("orgs").select("webhook_url,webhook_secret").eq("id", orgId).maybeSingle();
  const url = data?.webhook_url as string | undefined;
  const secret = data?.webhook_secret as string | undefined;
  return url && secret ? { url, secret } : null;
}

/** For the UI: is a webhook configured, and to what URL (the secret stays hidden). */
export async function getWebhookStatus(): Promise<{ configured: boolean; url: string | null }> {
  const cfg = await getWebhookConfig();
  return { configured: Boolean(cfg), url: cfg?.url ?? null };
}

/** Set (or replace) the org's webhook endpoint; generates a fresh signing secret
 *  and returns it ONCE. Throws on an invalid/unsafe URL or when there's no DB. */
export async function setWebhook(url: string): Promise<{ secret: string }> {
  const trimmed = url.trim();
  if (!isValidWebhookUrl(trimmed)) throw new Error("Enter a valid public https:// URL.");
  const client = getSupabase();
  if (!client) throw new Error("Webhooks require a connected database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;
  const { error } = await client.from("orgs").update({ webhook_url: trimmed, webhook_secret: secret }).eq("id", orgId);
  if (error) throw new Error(error.message);
  return { secret };
}

export async function removeWebhook(): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Webhooks require a connected database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const { error } = await client.from("orgs").update({ webhook_url: null, webhook_secret: null }).eq("id", orgId);
  if (error) throw new Error(error.message);
}

/**
 * POST a signed event to a webhook URL. SSRF-guarded, timed-out, and total: it
 * never throws — returns {ok} so callers can fire it without try/catch.
 */
export async function postWebhook(url: string, secret: string, event: string, data: unknown): Promise<{ ok: boolean; status?: number }> {
  try {
    assertSafeOutboundUrl(url); // blocks loopback/private/metadata at delivery time
  } catch {
    return { ok: false };
  }
  const body = JSON.stringify({ event, data, sentAt: new Date().toISOString() });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "RevenueRecall-Webhooks/1",
        "x-rr-event": event,
        "x-rr-signature": `sha256=${signWebhook(secret, body)}`,
      },
      body,
      redirect: "manual", // don't follow a redirect into a blocked host
      signal: ctrl.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    logError("webhook.deliver", { webhookEvent: event, error: errMessage(err) });
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Emit an event to the CURRENT org's webhook (if configured). Best-effort and
 * total — safe to call from inside request/runWithOrg scope without guarding.
 */
export async function emitWebhook(event: string, data: unknown): Promise<void> {
  try {
    const cfg = await getWebhookConfig();
    if (!cfg) return;
    await postWebhook(cfg.url, cfg.secret, event, data);
  } catch {
    /* never let event emission affect the caller */
  }
}
