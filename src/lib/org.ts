import { cache } from "@/lib/cache";
import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";
import { DEFAULT_LANGUAGE } from "@/lib/languages";
import { defaultNotificationPrefs, mergeNotificationPrefs, type NotificationPrefs } from "@/lib/notifications";
import { defaultTheme, mergeTheme, type Theme } from "@/lib/theme";
import { mergeVoiceSettings, DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "@/lib/voice/voice-settings";
import { isValidTimeZone } from "@/lib/tz";

export { NOTIFICATION_OPTIONS, defaultNotificationPrefs, mergeNotificationPrefs, type NotificationPrefs } from "@/lib/notifications";

export interface OrgCompliance {
  /** Sender name shown in the email footer (defaults to the org name). */
  senderName?: string;
  /** Physical postal address — legally required in commercial email (CAN-SPAM). */
  address?: string;
}

export interface OrgSettings {
  id?: string;
  name: string;
  industryId: string;
  /** ISO 639-1 language the workspace sells in (drives AI drafting + voice). */
  language: string;
  currency: string;
  monthlyQuota: number;
  notificationPrefs: NotificationPrefs;
  theme: Theme;
  compliance: OrgCompliance;
  /** Per-org automation enable overrides ({ automationId: boolean }); absent keys
   *  fall back to the template default in lib/automations.ts. */
  automations: Record<string, boolean>;
  /** This org's own caller-ID / "from" number (E.164) for calls + SMS. Each org
   *  brings/buys their own, so this is per-org, not a single platform number. */
  callerId?: string;
  /** This org's outbound CALL voice — a house voice id (e.g. "af_heart", which
   *  maps to an ElevenLabs voice) or a "clone:<id>" signature voice. Undefined =
   *  gateway default. */
  voiceId?: string;
  /** This org's hosted read-aloud voice — an "eleven:<id>" ElevenLabs voice
   *  (stock or the org's own clone) used by the neural TTS. Undefined = default. */
  ttsVoiceId?: string;
  /** Per-org read-aloud voice tuning (speaking speed + expressiveness). */
  voiceSettings: VoiceSettings;
  /** IANA timezone (e.g. "America/New_York") the workspace operates in — drives
   *  the daily digest's local send time. Empty = fall back to a fixed UTC hour. */
  timezone: string;
  /** Global kill switch: when true, ALL autonomous sending (autopilot + cadences)
   *  is held — drafts queue to Approvals instead of going out. The "pause
   *  everything" brake for an agent that acts on the user's behalf. */
  sendingPaused: boolean;
  /** true when backed by a database row (editable), false when env-derived. */
  persisted: boolean;
}

function mergeCompliance(stored?: Record<string, unknown> | null): OrgCompliance {
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  return {
    senderName: typeof s.senderName === "string" && s.senderName ? s.senderName : undefined,
    address: typeof s.address === "string" && s.address ? s.address : undefined,
  };
}

function envFallback(): OrgSettings {
  const cfg = getConfig();
  return {
    name: cfg.orgName,
    industryId: cfg.industryId,
    language: DEFAULT_LANGUAGE,
    currency: getIndustry(cfg.industryId).currency,
    monthlyQuota: cfg.monthlyQuota,
    notificationPrefs: defaultNotificationPrefs(),
    theme: defaultTheme(),
    compliance: {},
    automations: {},
    callerId: process.env.OUTBOUND_FROM_NUMBER || undefined,
    voiceId: process.env.OUTBOUND_VOICE_ID || undefined,
    ttsVoiceId: undefined,
    voiceSettings: { ...DEFAULT_VOICE_SETTINGS },
    timezone: process.env.AGENT_TIMEZONE || "",
    sendingPaused: false,
    persisted: false,
  };
}

async function read(): Promise<OrgSettings> {
  const client = getSupabase();
  if (!client) return envFallback();
  try {
    const orgId = await resolveActiveOrgId();
    if (!orgId) return envFallback();
    const { data } = await client
      .from("orgs")
      .select("id,name,industry_id,language,currency,monthly_quota,notification_prefs,theme,compliance,caller_id,voice_id,tts_voice_id,voice_settings,automations,timezone,sending_paused")
      .eq("id", orgId)
      .maybeSingle();
    if (!data) return envFallback();
    return {
      id: data.id as string,
      name: (data.name as string) ?? getConfig().orgName,
      industryId: (data.industry_id as string) ?? "generic",
      language: (data.language as string) ?? DEFAULT_LANGUAGE,
      currency: (data.currency as string) ?? "USD",
      monthlyQuota: Number(data.monthly_quota ?? getConfig().monthlyQuota),
      notificationPrefs: mergeNotificationPrefs(data.notification_prefs as Record<string, unknown> | null),
      theme: mergeTheme(data.theme as Record<string, unknown> | null),
      compliance: mergeCompliance(data.compliance as Record<string, unknown> | null),
      automations: (data.automations && typeof data.automations === "object" ? (data.automations as Record<string, boolean>) : {}),
      callerId: (data.caller_id as string) || process.env.OUTBOUND_FROM_NUMBER || undefined,
      voiceId: (data.voice_id as string) || process.env.OUTBOUND_VOICE_ID || undefined,
      ttsVoiceId: (data.tts_voice_id as string) || undefined,
      voiceSettings: mergeVoiceSettings(data.voice_settings as Record<string, unknown> | null),
      timezone: (data.timezone as string) || process.env.AGENT_TIMEZONE || "",
      sendingPaused: data.sending_paused === true,
      persisted: true,
    };
  } catch {
    // A transient DB/network failure must NOT bubble out of the (app) layout —
    // a *layout* throw escapes the in-app error boundary ((app)/error.tsx) and
    // degrades the user to the root error page. Fall back to env defaults so the
    // shell still renders (every other getOrgSettings caller benefits too).
    return envFallback();
  }
}

/** Current org settings (DB-backed when available, else env). Request-cached. */
export const getOrgSettings = cache(read);

export async function updateOrgSettings(patch: {
  name?: string;
  industryId?: string;
  language?: string;
  monthlyQuota?: number;
  notificationPrefs?: NotificationPrefs;
  theme?: Partial<Theme>;
  compliance?: OrgCompliance;
  /** This org's caller-ID / from number (E.164), or "" to clear. */
  callerId?: string;
  /** This org's outbound call voice id (house id or "clone:<id>"), or "" to clear. */
  voiceId?: string;
  /** This org's hosted read-aloud voice ("eleven:<id>"), or "" to clear. */
  ttsVoiceId?: string;
  /** Per-org read-aloud voice tuning (partial — merged over current). */
  voiceSettings?: Partial<VoiceSettings>;
  /** Per-org automation enable overrides ({ automationId: boolean }). */
  automations?: Record<string, boolean>;
  /** IANA timezone, or "" to clear (fall back to the fixed UTC digest hour). */
  timezone?: string;
  /** Global kill switch for all autonomous sending. */
  sendingPaused?: boolean;
}): Promise<OrgSettings> {
  const client = getSupabase();
  if (!client) throw new Error("Settings are read-only without a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  // Switching industry re-tunes pipeline terminology/playbooks and follows the
  // template's native currency.
  if (patch.industryId !== undefined) {
    update.industry_id = patch.industryId;
    update.currency = getIndustry(patch.industryId).currency;
  }
  if (patch.language !== undefined) update.language = patch.language;
  if (patch.monthlyQuota !== undefined) update.monthly_quota = patch.monthlyQuota;
  if (patch.notificationPrefs !== undefined) update.notification_prefs = mergeNotificationPrefs(patch.notificationPrefs);
  // Merge a partial theme patch over the org's current theme so changing the
  // mode never resets the accent (or vice-versa).
  if (patch.theme !== undefined) {
    const current = await read();
    update.theme = mergeTheme({ ...current.theme, ...patch.theme });
  }
  if (patch.compliance !== undefined) {
    const current = await read();
    update.compliance = mergeCompliance({ ...current.compliance, ...patch.compliance });
  }
  if (patch.callerId !== undefined) update.caller_id = patch.callerId.trim() || null;
  if (patch.voiceId !== undefined) update.voice_id = patch.voiceId.trim() || null;
  if (patch.ttsVoiceId !== undefined) update.tts_voice_id = patch.ttsVoiceId.trim() || null;
  if (patch.voiceSettings !== undefined) {
    const current = await read();
    update.voice_settings = mergeVoiceSettings({ ...current.voiceSettings, ...patch.voiceSettings });
  }
  if (patch.automations !== undefined) update.automations = patch.automations;
  if (patch.sendingPaused !== undefined) update.sending_paused = patch.sendingPaused;
  // Only store a valid IANA zone; anything else clears it (→ UTC digest fallback).
  if (patch.timezone !== undefined) {
    const tz = patch.timezone.trim();
    update.timezone = tz && isValidTimeZone(tz) ? tz : null;
  }
  if (Object.keys(update).length === 0) return read();
  const { error } = await client.from("orgs").update(update).eq("id", orgId);
  if (error) throw new Error(error.message);
  return read();
}
