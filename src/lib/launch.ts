import { getConfig } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isAiConfigured } from "@/lib/ai/client";
import { channelStatus } from "@/lib/comms";

/**
 * Launch readiness — the single source of truth for "what still needs wiring,"
 * shared by /api/health (machine probe) and the in-app LaunchBanner (so the two
 * can never drift). Blockers stop a real multi-tenant launch; warnings are
 * things that limit the product (no live AI, no sending channel) but don't break
 * isolation. Pure config reads — safe to call anywhere server-side.
 */
export interface LaunchStatus {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

export function launchStatus(): LaunchStatus {
  const cfg = getConfig();
  const ch = channelStatus();

  const blockers: string[] = [];
  if (!isSupabaseConfigured()) blockers.push("No database connected — set the SUPABASE_* env vars.");
  if (!cfg.authRequired) blockers.push("Auth is optional — connect a database so every user gets a private workspace, or set NEXT_PUBLIC_AUTH_REQUIRED=true.");
  if (isSupabaseConfigured() && !process.env.SUPABASE_SERVICE_ROLE_KEY) blockers.push("Database connected without a service-role key — new accounts can't be provisioned (set SUPABASE_SERVICE_ROLE_KEY).");

  const warnings: string[] = [];
  if (!ch.email.live && !ch.sms.live && !ch.voice.live) warnings.push("No sending channel connected — connect email (Resend) or SMS/voice (Twilio) so outreach can actually send.");
  else if (!ch.email.live) warnings.push("Email sending is off — connect Resend so signup, invite, and outreach emails actually send.");
  if (!isAiConfigured()) warnings.push("AI is in template mode — add ANTHROPIC_API_KEY for live, in-your-voice drafting.");

  return { ready: blockers.length === 0, blockers, warnings };
}
