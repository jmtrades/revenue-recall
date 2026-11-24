/**
 * One row in the org's results ledger. Every meaningful thing the system does
 * — a send, a click, a call, a webinar join or leave, a booking, a win, an
 * opt-out, an AI action, a cost — is one of these. Revenue and cost are in the
 * org's currency units (dollars), matching the rest of the CRM, not cents.
 */

export const ROI_EVENT_NAMES = [
  "message.sent",
  "message.clicked",
  "message.replied",
  "message.opt_out",
  "call.dialed",
  "call.connected",
  "call.no_answer",
  "call.voicemail",
  "call.completed",
  "call.opt_out",
  "webinar.registered",
  "webinar.joined",
  "webinar.left",
  "webinar.replay_started",
  "webinar.replay_completed",
  "webinar.recovered",
  "meeting.booked",
  "meeting.showed",
  "meeting.no_show",
  "deal.won",
  "deal.lost",
  "ai.action",
  "cost.recorded",
] as const;

export type RoiEventName = (typeof ROI_EVENT_NAMES)[number];

export type RoiChannel = "email" | "sms" | "call" | "webinar" | "meeting" | "system";

export type RoiActor = "ai" | "user" | "system" | "prospect";

export interface RoiEvent {
  id: string;
  dedupeKey: string;
  name: RoiEventName;
  occurredAt: string;
  channel?: RoiChannel;
  contactId?: string;
  dealId?: string;
  leadId?: string;
  campaignId?: string;
  sequenceId?: string;
  stepId?: string;
  revenue?: number;
  cost?: number;
  actor?: RoiActor;
}

export interface NewRoiEvent {
  dedupeKey: string;
  name: RoiEventName;
  occurredAt?: string;
  channel?: RoiChannel;
  contactId?: string;
  dealId?: string;
  leadId?: string;
  campaignId?: string;
  sequenceId?: string;
  stepId?: string;
  revenue?: number;
  cost?: number;
  actor?: RoiActor;
  /** When the caller already knows the org (webhooks). Otherwise the active org is used. */
  orgId?: string;
}

export function isRoiEventName(v: string): v is RoiEventName {
  return (ROI_EVENT_NAMES as readonly string[]).includes(v);
}

/** Minutes of rep work we estimate an AI action replaced. A workload model, not a timesheet. */
export const SAVED_MINUTES = {
  aiAction: 6,
  aiMessage: 4,
  aiCall: 8,
} as const;

/** How long after a touch a later win can still be credited to it. */
export const ATTRIBUTION_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

export const DEFAULT_WINDOW_DAYS = 30;
