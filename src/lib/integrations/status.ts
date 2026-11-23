/**
 * Which relaunch keys are present. Booleans only — never the secret values.
 * Pure so the settings panel and its tests share one reading of the env.
 */

export interface IntegrationRow {
  id: string;
  label: string;
  ok: boolean;
  missing: string;
  /** What a test send needs besides the key itself. */
  test: "email" | "sms" | "call" | "none";
}

export function integrationStatus(env: Record<string, string | undefined> = process.env): IntegrationRow[] {
  const has = (name: string) => Boolean(env[name] && env[name]!.length > 0);
  return [
    { id: "elevenlabs", label: "ElevenLabs", ok: has("ELEVENLABS_API_KEY"), missing: "ELEVENLABS_API_KEY", test: "none" },
    { id: "elevenlabs-agent", label: "Live voice agent", ok: has("ELEVENLABS_API_KEY") && has("ELEVENLABS_AGENT_ID"), missing: "ELEVENLABS_AGENT_ID", test: "none" },
    { id: "anthropic", label: "Anthropic", ok: has("ANTHROPIC_API_KEY"), missing: "ANTHROPIC_API_KEY", test: "none" },
    { id: "twilio", label: "Twilio", ok: has("TWILIO_ACCOUNT_SID") && has("TWILIO_AUTH_TOKEN") && has("TWILIO_FROM_NUMBER"), missing: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER", test: "sms" },
    { id: "voice", label: "Call transport", ok: has("VOICE_WEBHOOK_URL") || (has("TWILIO_ACCOUNT_SID") && has("TWILIO_AUTH_TOKEN")), missing: "VOICE_WEBHOOK_URL or Twilio", test: "call" },
    { id: "email", label: "Email", ok: has("RESEND_API_KEY") || has("SENDGRID_API_KEY"), missing: "RESEND_API_KEY or SENDGRID_API_KEY", test: "email" },
    { id: "webinar", label: "Webinar webhook", ok: has("WEBINAR_WEBHOOK_SECRET") || has("ZOOM_WEBHOOK_SECRET") || has("DEMIO_WEBHOOK_SECRET") || has("GOTO_WEBHOOK_SECRET") || has("WEBINARJAM_WEBHOOK_SECRET"), missing: "WEBINAR_WEBHOOK_SECRET (or a platform secret)", test: "none" },
  ];
}
