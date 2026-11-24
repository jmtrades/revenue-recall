import { voiceCostPerMinuteUsd } from "@/lib/billing/voice-minutes";
import type { CanonicalEvent } from "@/lib/webinar/types";
import { recordRoiEvent } from "@/lib/roi/store";
import type { NewRoiEvent, RoiChannel, RoiEventName } from "@/lib/roi/types";

/** Best-effort. A tracking failure must never fail the send, webhook, or call log. */
export async function captureRoi(input: NewRoiEvent): Promise<void> {
  try {
    await recordRoiEvent(input);
  } catch {
    /* the action already happened; the ledger can miss a row rather than break it */
  }
}

function minuteKey(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? String(Math.floor(t / 60_000)) : iso.slice(0, 16);
}

export async function captureMessage(input: {
  kind: "sent" | "reply" | "click";
  orgId?: string;
  contactId?: string;
  dealId?: string;
  channel?: "email" | "sms";
  actor?: NewRoiEvent["actor"];
  sequenceId?: string;
  campaignId?: string;
  url?: string;
}): Promise<void> {
  const name: RoiEventName = input.kind === "sent" ? "message.sent" : input.kind === "reply" ? "message.replied" : "message.clicked";
  const at = new Date().toISOString();
  const who = input.contactId || input.dealId || "anon";
  const extra = input.url ? input.url.slice(0, 80) : "";
  await captureRoi({
    orgId: input.orgId,
    dedupeKey: `msg:${input.kind}:${who}:${input.channel ?? ""}:${minuteKey(at)}:${extra}`,
    name,
    occurredAt: at,
    channel: input.channel,
    contactId: input.contactId,
    dealId: input.dealId,
    actor: input.actor ?? (input.kind === "reply" || input.kind === "click" ? "prospect" : "system"),
    sequenceId: input.sequenceId,
    campaignId: input.campaignId ?? input.sequenceId,
  });
}

export async function captureCall(input: {
  orgId?: string;
  callId?: string;
  contactId?: string;
  dealId?: string;
  outcome?: string;
  durationSec?: number;
  actor?: NewRoiEvent["actor"];
}): Promise<void> {
  const at = new Date().toISOString();
  const o = (input.outcome ?? "").toLowerCase();
  let name: RoiEventName = "call.dialed";
  if (/opt[\s-]?out|do not call/.test(o)) name = "call.opt_out";
  else if (/voicemail|\bvm\b|machine/.test(o)) name = "call.voicemail";
  else if (/no[-\s]?answer|missed|unanswered|busy/.test(o)) name = "call.no_answer";
  else if (/connect|completed|answered|spoke|conversation/.test(o)) name = (input.durationSec ?? 0) >= 8 ? "call.connected" : "call.completed";
  else if (input.durationSec && input.durationSec > 0) name = "call.completed";
  const key = input.callId ? `call:${input.callId}` : `call:${input.contactId ?? input.dealId ?? "anon"}:${minuteKey(at)}:${name}`;
  const minutes = (input.durationSec ?? 0) / 60;
  const cost = minutes > 0 ? Math.round(minutes * voiceCostPerMinuteUsd() * 10000) / 10000 : undefined;
  await captureRoi({
    orgId: input.orgId,
    dedupeKey: key,
    name,
    occurredAt: at,
    channel: "call",
    contactId: input.contactId,
    dealId: input.dealId,
    actor: input.actor ?? "system",
    cost,
  });
}

const WEBINAR_NAME: Partial<Record<CanonicalEvent["type"], RoiEventName>> = {
  "registrant.registered": "webinar.registered",
  "attendance.joined": "webinar.joined",
  "attendance.left": "webinar.left",
  "attendance.replay_started": "webinar.replay_started",
  "attendance.replay_completed": "webinar.replay_completed",
  "outcome.booked": "webinar.recovered",
  "outcome.opt_out": "message.opt_out",
};

/**
 * Attendance and outcomes from the webinar webhook. Delivery receipts
 * (outcome.call/sms/email) are skipped here — the call log and message
 * ledger already record those, and counting both would double the work.
 */
export async function captureWebinarEvents(orgId: string, events: CanonicalEvent[]): Promise<void> {
  for (const event of events) {
    const name = WEBINAR_NAME[event.type];
    if (!name) continue;
    const channel: RoiChannel = name.startsWith("webinar") ? "webinar" : name === "message.opt_out" ? "email" : "meeting";
    await captureRoi({
      orgId,
      dedupeKey: `webinar:${event.dedupeKey}`,
      name,
      occurredAt: event.occurredAt,
      channel: name === "webinar.recovered" ? "webinar" : channel,
      contactId: event.registrant?.contactId,
      leadId: event.registrant?.id || event.registrant?.email,
      campaignId: event.session.id,
      actor: name === "message.opt_out" ? "prospect" : "system",
    });
    if (name === "webinar.recovered") {
      await captureRoi({
        orgId,
        dedupeKey: `webinar-booked:${event.dedupeKey}`,
        name: "meeting.booked",
        occurredAt: event.occurredAt,
        channel: "meeting",
        contactId: event.registrant?.contactId,
        leadId: event.registrant?.id || event.registrant?.email,
        campaignId: event.session.id,
        actor: "prospect",
      });
    }
  }
}
