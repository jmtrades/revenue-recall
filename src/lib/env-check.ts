import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Production configuration audit — the missing-secret failure modes in this
 * codebase are SILENT by design (webhooks fail closed, cron refuses to run,
 * email blocks on a missing postal address), which protects the platform but
 * looks like "nothing happens" to an operator. This module turns each silent
 * gap into an explicit, named issue surfaced on /api/health (launch blockers /
 * warnings) so a misdeployed production env is loud on the first probe instead
 * of being discovered as a mystery outage.
 *
 * Pure read of process.env — safe to call from any route.
 */

const has = (name: string): boolean => Boolean(process.env[name] && process.env[name]!.length > 0);

export interface ConfigAudit {
  blockers: string[];
  warnings: string[];
}

export function productionConfigIssues(): ConfigAudit {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const prod = process.env.NODE_ENV === "production";
  if (!prod) return { blockers, warnings };

  // The hourly tick is the autonomous heart (cadences, retries, digests,
  // billing reconcile). Without CRON_SECRET the production cron refuses every
  // request — outreach silently stops.
  if (!has("CRON_SECRET")) {
    blockers.push("CRON_SECRET is not set — the production cron rejects all ticks, so autopilot, cadences, retries, and billing reconciliation are all stopped.");
  }

  // Stripe configured halfway: payments succeed but plan grants never arrive.
  if (has("STRIPE_SECRET_KEY") && !has("STRIPE_WEBHOOK_SECRET")) {
    blockers.push("STRIPE_SECRET_KEY is set without STRIPE_WEBHOOK_SECRET — checkouts charge but the webhook can't verify events, so paid plans are never granted.");
  }

  // Voice gateway configured without the shared postback token: calls go out
  // but transcripts/outcomes can't land back on the tenant timeline.
  if (has("VOICE_WEBHOOK_URL") && !has("COMMS_WEBHOOK_TOKEN")) {
    warnings.push("VOICE_WEBHOOK_URL is set without COMMS_WEBHOOK_TOKEN — the call gateway's transcript postbacks can't authenticate.");
  }

  // Inbound channels live without a verification path: in production the
  // handlers fail closed, so replies (including STOP opt-outs!) are dropped.
  const smsLive = has("TWILIO_AUTH_TOKEN");
  if (!smsLive && has("SMS_WEBHOOK_URL") && !has("INBOUND_TOKEN") && !has("INBOUND_SIGNING_SECRET")) {
    warnings.push("SMS sends via webhook but no INBOUND_TOKEN/INBOUND_SIGNING_SECRET is set — inbound replies (including STOP opt-outs) can't be verified and will be rejected.");
  }

  // CAN-SPAM: commercial email requires a postal address; sends without one are
  // refused at the transport. Per-org addresses satisfy this too, so it's a
  // warning (the platform default backstops orgs that haven't set their own).
  if (!has("COMPLIANCE_ADDRESS")) {
    warnings.push("COMPLIANCE_ADDRESS is not set — orgs without their own postal address in Settings → General will have outreach email refused (CAN-SPAM).");
  }

  // Per-org connection secrets are AES-encrypted with this key; without it,
  // social/CRM connections silently can't be stored.
  if (isSupabaseConfigured() && !has("ENCRYPTION_KEY")) {
    warnings.push("ENCRYPTION_KEY is not set — per-org connection secrets (social tokens, CRM keys) can't be encrypted at rest.");
  }

  return { blockers, warnings };
}
