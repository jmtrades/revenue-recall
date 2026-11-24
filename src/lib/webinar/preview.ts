import { webinarConfig } from "@/lib/webinar/config";
import { gateAction } from "@/lib/webinar/compliance";
import { callOpener, emailContent, smsBody, voicemailScript } from "@/lib/webinar/copy";
import { applyEvent, blankRegistrant } from "@/lib/webinar/machine";
import { normalizeWebinarEvents } from "@/lib/webinar/normalize";
import type { RecoveryAction, WebinarSession } from "@/lib/webinar/types";
import { providerVoice, callVoiceProfile } from "@/lib/voice/tts";
import { DEFAULT_HOUSE_VOICE } from "@/lib/voice/house";

export interface PreviewStep {
  stepId: string;
  channel: RecoveryAction["channel"];
  purpose: string;
  dueAt: string;
  immediate: boolean;
  gate: string;
  to?: string;
  opener?: string;
  voicemail?: string;
  sms?: string;
  emailSubject?: string;
  emailBody?: string;
}

export interface DropOffPreview {
  dryRun: true;
  placedCall: false;
  sentSms: false;
  sentEmail: false;
  ignored?: string;
  state?: string;
  fromNumber: string;
  voiceId: string;
  elevenVoiceId: string;
  steps: PreviewStep[];
}

function callerId(): string {
  return (process.env.TWILIO_FROM_NUMBER ?? "").trim() || "+17622405708";
}

/**
 * Run the leave state machine in memory. Nothing is saved and nothing is dialed.
 * The returned steps are what a real event with the same body would queue.
 */
export function previewDropOff(provider: string, body: unknown, now = new Date()): DropOffPreview {
  const events = normalizeWebinarEvents(provider, body, now);
  const event = events[0];
  const voice = callVoiceProfile(DEFAULT_HOUSE_VOICE);
  const base: DropOffPreview = {
    dryRun: true,
    placedCall: false,
    sentSms: false,
    sentEmail: false,
    fromNumber: callerId(),
    voiceId: voice.voiceId ?? DEFAULT_HOUSE_VOICE,
    elevenVoiceId: providerVoice("elevenlabs", DEFAULT_HOUSE_VOICE),
    steps: [],
  };
  if (!event || event.type === "session.upsert") return { ...base, ignored: event ? "session_only" : "no_events" };

  const session: WebinarSession = {
    id: event.session.id,
    provider: event.provider,
    title: event.session.title || "Webinar",
    phase: event.session.phase ?? "live",
    timezone: event.session.timezone,
    startsAt: event.session.startsAt,
    endsAt: event.session.endsAt,
    offerAt: event.session.offerAt,
    rejoinUrl: event.session.rejoinUrl,
    replayUrl: event.session.replayUrl,
  };
  const reg = blankRegistrant(session.id, `${session.id}:preview`);
  const result = applyEvent(reg, event, session, now, webinarConfig());
  const cfg = webinarConfig();
  const steps: PreviewStep[] = reg.actions
    .filter((a) => a.status === "pending" || a.status === "skipped")
    .map((action) => {
      const gate = gateAction(reg, action, session, now, cfg);
      const immediate = gate.ok && new Date(action.dueAt).getTime() <= now.getTime();
      const step: PreviewStep = {
        stepId: action.stepId,
        channel: action.channel,
        purpose: action.purpose,
        dueAt: action.dueAt,
        immediate,
        gate: gate.ok ? "ready" : gate.reason,
        to: action.channel === "email" ? reg.email : reg.phone,
      };
      if (action.channel === "call") {
        step.opener = callOpener(reg, session, action.purpose);
        if (action.voicemail) step.voicemail = voicemailScript(reg, session, action.purpose);
      } else if (action.channel === "sms") {
        step.sms = smsBody(reg, session, action.purpose);
      } else {
        const mail = emailContent(reg, session, action.purpose);
        step.emailSubject = mail.subject;
        step.emailBody = mail.body;
      }
      return step;
    });
  return { ...base, ignored: result.ignored, state: reg.state, steps };
}
