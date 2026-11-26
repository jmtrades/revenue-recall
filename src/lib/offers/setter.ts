import { OFFERS, blockedEmail, type OfferId } from "@/lib/offers/catalog";

export type ChannelStatus = "sent" | "logged" | "skipped" | "blocked";

export interface SetterPlan {
  offer: OfferId;
  call: ChannelStatus;
  sms: ChannelStatus;
  email: ChannelStatus;
  reason: string;
  bookingUrl: string;
}

const DEFAULT_VERIFIED = ["+16502885280", "+447359365661"];

export function verifiedNumbers(raw = process.env.TWILIO_VERIFIED_NUMBERS): Set<string> {
  const list = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return new Set(list.length ? list : DEFAULT_VERIFIED);
}

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function planSetterOutreach(input: {
  email?: string;
  phone?: string;
  test?: boolean;
  voiceReady?: boolean;
  verified?: Set<string>;
  bookingUrl?: string;
}): SetterPlan {
  const bookingUrl = input.bookingUrl || process.env.BOOKING_URL || "/book/local";
  const base = { offer: "setter-demo" as const, bookingUrl };
  if (blockedEmail(input.email)) {
    return { ...base, call: "blocked", sms: "blocked", email: "blocked", reason: "blocked_inbox" };
  }
  if (input.test) {
    return { ...base, call: "logged", sms: "logged", email: "logged", reason: "test_mode" };
  }
  const known = input.verified ?? verifiedNumbers();
  const phone = digits(input.phone ?? "");
  const verified = [...known].some((n) => digits(n) === phone && phone.length >= 10);
  const call: ChannelStatus = !input.voiceReady ? "logged" : verified ? "sent" : "skipped";
  const reason = !input.voiceReady ? "no_voice_transport" : verified ? "calling" : "twilio_trial_unverified";
  return { ...base, call, sms: input.phone ? "sent" : "skipped", email: input.email ? "sent" : "skipped", reason };
}

export function setterMessage(name: string, bookingUrl: string): { sms: string; emailSubject: string; emailBody: string; opener: string } {
  const who = name.trim().split(/\s+/)[0] || "there";
  return {
    opener: `Hey ${who}, it's the setting team. You asked for the 60-second demo. I'll book the build call if this is a fit. ${bookingUrl}`,
    sms: `Hey ${who}, it's the AI setter. Grab a 15-minute build call here: ${bookingUrl} Reply STOP to opt out.`,
    emailSubject: "Your AI setter demo",
    emailBody: `Hey ${who},\n\nYou asked us to call. If we missed you, book the 15-minute build call here:\n\n${bookingUrl}\n\nReply if now is a bad time.`,
  };
}

export const SETTER_SOURCE = OFFERS["setter-demo"].source;
