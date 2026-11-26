import { adsReport, type AdsReport } from "@/lib/ads/rollup";
import { parseScheduleWebhook } from "@/lib/ads/forward";
import type { SpendRow, StoredEvent } from "@/lib/ads/store";
import { planTeamReply } from "@/lib/agent/team";
import { planCommentReply } from "@/lib/social/comment-dm";
import { metaMessagingChannel } from "@/lib/social/meta-messaging";
import { WEBINAR_PLATFORMS } from "@/lib/webinar/platforms";
import { previewDropOff } from "@/lib/webinar/preview";

const PHONE = "+16502885280";
const EMAIL = "qa@example.com";
const NOW = new Date("2026-06-10T15:00:00.000Z");

function person() {
  return {
    email: EMAIL,
    phone: PHONE,
    name: "Sam Taylor",
    consent: { call: true, sms: true, email: true },
  };
}

/** A leave-shaped body each platform's parser accepts, with the verified test number. */
export function leaveBody(provider: string): unknown {
  const who = person();
  if (provider === "zoom") {
    return {
      event: "webinar.participant_left",
      event_ts: NOW.getTime(),
      payload: { object: { id: "sess", topic: "Offer workshop", participant: { email: who.email, user_name: who.name, phone: who.phone, consent: who.consent } } },
    };
  }
  if (provider === "demio") return { event: "left", webinar_id: "sess", email: who.email, phone: who.phone, name: who.name, consent: who.consent };
  if (provider === "webinarjam" || provider === "everwebinar") {
    return { event_type: "attendance.left", webinar_id: "sess", email: who.email, phone: who.phone, first_name: "Sam", last_name: "Taylor", consent: who.consent };
  }
  if (provider === "goto") {
    return { eventName: "registrant.left", webinarKey: "sess", email: who.email, phone: who.phone, firstName: "Sam", lastName: "Taylor", consent: who.consent };
  }
  if (provider === "livestorm") {
    return { type: "attendance.left", session: { id: "sess", phase: "live" }, registrant: who };
  }
  if (provider === "webinargeek") return { event: "new viewer", entity: { webinar_id: "sess", email: who.email, phone: who.phone, first_name: "Sam", last_name: "Taylor", consent: who.consent } };
  return {
    type: "attendance.left",
    session: { id: "sess", title: "Offer workshop", phase: "live" },
    registrant: who,
  };
}

export interface PlatformJourney {
  provider: string;
  state?: string;
  channels: string[];
  callReady: boolean;
  hasSms: boolean;
  hasEmail: boolean;
  placedCall: false;
}

export function simulatePlatforms(now = NOW): PlatformJourney[] {
  return WEBINAR_PLATFORMS.map((p) => {
    const preview = previewDropOff(p.id, leaveBody(p.id), now);
    const channels = [...new Set(preview.steps.map((s) => s.channel))];
    return {
      provider: p.id,
      state: preview.state,
      channels,
      callReady: preview.steps.some((s) => s.channel === "call" && s.gate === "ready"),
      hasSms: preview.steps.some((s) => s.channel === "sms"),
      hasEmail: preview.steps.some((s) => s.channel === "email"),
      placedCall: preview.placedCall,
    };
  });
}

export function simulateQuietHours(): { liveCallReady: boolean; laterSmsHeld: boolean } {
  // 06:00 UTC is 11pm in California, where +1 650 lives. The live leave call
  // still goes. The follow-up text waits for morning.
  const night = new Date("2026-06-11T06:00:00.000Z");
  const preview = previewDropOff("generic", leaveBody("generic"), night);
  const call = preview.steps.find((s) => s.stepId === "leave-call-1");
  const sms = preview.steps.find((s) => s.channel === "sms");
  return {
    liveCallReady: call?.gate === "ready",
    laterSmsHeld: sms?.gate === "quiet_hours",
  };
}

export async function simulateMeta(secret = "journey-secret"): Promise<{ dm: boolean; comment: boolean; lead: boolean }> {
  const previous = process.env.META_APP_SECRET;
  process.env.META_APP_SECRET = secret;
  try {
    const channel = metaMessagingChannel("instagram");
    const body = JSON.stringify({
      entry: [{
        id: "page",
        messaging: [{ sender: { id: "u1" }, timestamp: NOW.getTime(), message: { mid: "m1", text: "can we book a call?" } }],
        changes: [
          { field: "comments", value: { id: "c1", text: "what's the price?", from: { id: "u2", username: "sam" } } },
          { field: "leadgen", value: { leadgen_id: "L1", page_id: "page", created_time: Math.floor(NOW.getTime() / 1000) } },
        ],
      }],
    });
    const crypto = await import("node:crypto");
    const sig = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
    const msgs = await channel.parseWebhook({ rawBody: body, headers: { "x-hub-signature-256": sig }, query: new URLSearchParams() });
    const comment = msgs.find((m) => m.kind === "comment");
    return {
      dm: msgs.some((m) => m.kind === "dm"),
      comment: Boolean(comment && planCommentReply(comment.text).match),
      lead: msgs.some((m) => m.kind === "lead"),
    };
  } finally {
    if (previous === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = previous;
  }
}

export function simulateChat(bookingUrl: string): { books: boolean; discloses: boolean; stopped: boolean; paused: boolean } {
  const book = planTeamReply({ text: "can we book a call Tuesday at 2pm?", channel: "web", seed: "qa", bookingUrl });
  const stopped = planTeamReply({ text: "STOP", channel: "web", seed: "qa" });
  const paused = planTeamReply({ text: "hello", channel: "web", seed: "qa", paused: true });
  return {
    books: book.role === "setter" && book.body.includes(bookingUrl),
    discloses: book.disclose,
    stopped: stopped.optOut && stopped.paused,
    paused: paused.paused && paused.body === "",
  };
}

export function simulateAttribution(): { bookingEmail?: string; roas: number | null; leads: number; bookings: number; sales: number } {
  const booking = parseScheduleWebhook({
    event: "invitee.created",
    payload: { email: EMAIL, name: "Sam Taylor", text_reminder_number: PHONE, scheduled_event: { start_time: NOW.toISOString() } },
  });
  const events: StoredEvent[] = [
    { id: "1", name: "Lead", at: NOW.toISOString(), source: "meta", medium: "paid", campaign: "webinar-coaches", content: "leak", term: "", landing: "/webinar-leak" },
    { id: "2", name: "Schedule", at: NOW.toISOString(), source: "meta", medium: "paid", campaign: "webinar-coaches", content: "leak", term: "", landing: "/webinar-leak" },
    { id: "3", name: "Purchase", at: NOW.toISOString(), source: "meta", medium: "paid", campaign: "webinar-coaches", content: "leak", term: "", landing: "/webinar-leak", value: 2000, currency: "USD" },
  ];
  const spend: SpendRow[] = [{ id: "s1", date: "2026-06-10", source: "meta", campaign: "webinar-coaches", amount: 500, currency: "USD" }];
  const report: AdsReport = adsReport(events, spend, null, null);
  return {
    bookingEmail: booking?.email,
    roas: report.totals.roas,
    leads: report.totals.leads,
    bookings: report.totals.bookings,
    sales: report.totals.sales,
  };
}
