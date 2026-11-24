import { anyWebinarArmed, WEBINAR_PLATFORMS } from "@/lib/webinar/platforms";
import { installSecret } from "@/lib/webinar/install";
import type { WebinarConfig } from "@/lib/webinar/types";

/**
 * Compliance limits for webinar recovery. Defaults are aggressive enough to
 * catch a live leaver (immediate call, a few redials, SMS, email) and tight
 * enough to stay inside TCPA (US) and Ofcom/PECR (UK): 9pm–8am quiet hours in
 * the lead's timezone, no Sunday marketing calls/texts, explicit call + SMS
 * consent, and small per-day caps so retries don't get the number flagged.
 *
 * Every limit is an env var. Unset means the default below — not unlimited.
 */

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  return fallback;
}

export function webinarConfig(): WebinarConfig {
  const tz = (process.env.WEBINAR_DEFAULT_TIMEZONE ?? "").trim();
  return {
    maxCallsPerDay: intEnv("WEBINAR_MAX_CALLS_PER_DAY", 3, 0, 20),
    maxSmsPerDay: intEnv("WEBINAR_MAX_SMS_PER_DAY", 2, 0, 20),
    maxEmailsPerDay: intEnv("WEBINAR_MAX_EMAILS_PER_DAY", 3, 0, 20),
    maxCallsPerSession: intEnv("WEBINAR_MAX_CALLS_PER_SESSION", 4, 0, 20),
    maxSmsPerSession: intEnv("WEBINAR_MAX_SMS_PER_SESSION", 3, 0, 20),
    maxEmailsPerSession: intEnv("WEBINAR_MAX_EMAILS_PER_SESSION", 3, 0, 20),
    maxVoicemailDrops: intEnv("WEBINAR_MAX_VOICEMAIL_DROPS", 1, 0, 5),
    quietStartHour: intEnv("WEBINAR_QUIET_START_HOUR", 21, 0, 23),
    quietEndHour: intEnv("WEBINAR_QUIET_END_HOUR", 8, 0, 23),
    blockSunday: boolEnv("WEBINAR_BLOCK_SUNDAY", true),
    requireCallConsent: boolEnv("WEBINAR_REQUIRE_CALL_CONSENT", true),
    requireSmsConsent: boolEnv("WEBINAR_REQUIRE_SMS_CONSENT", true),
    liveCallOverride: boolEnv("WEBINAR_LIVE_CALL_OVERRIDE", true),
    lateJoinAfterSec: intEnv("WEBINAR_LATE_JOIN_SEC", 600, 0, 86_400),
    offerWindowSec: intEnv("WEBINAR_OFFER_WINDOW_SEC", 180, 0, 3_600),
    defaultTimezone: tz || "Europe/London",
    emailQuiet: boolEnv("WEBINAR_EMAIL_QUIET", false),
  };
}

/** True when any platform secret, the shared webhook/beacon secret, or the generated install secret is set. */
export function webinarArmed(): boolean {
  return anyWebinarArmed(installSecret());
}

const SECRET_ENV: Record<string, string> = {
  gotowebinar: "GOTO_WEBHOOK_SECRET",
  zohowebinar: "ZOHO_WEBHOOK_SECRET",
  zohomeeting: "ZOHO_WEBHOOK_SECRET",
  beacon: "WEBINAR_BEACON_TOKEN",
};
for (const p of WEBINAR_PLATFORMS) SECRET_ENV[p.id] = p.secretEnv;

/** Provider secret, else the shared webhook secret, else the beacon token. */
export function secretForProvider(provider: string): string | undefined {
  const key = provider.toLowerCase();
  const specific = (process.env[SECRET_ENV[key] ?? ""] ?? "").trim();
  const generic = (process.env.WEBINAR_WEBHOOK_SECRET ?? "").trim();
  const beacon = (process.env.WEBINAR_BEACON_TOKEN ?? "").trim();
  return specific || generic || beacon || installSecret() || undefined;
}
