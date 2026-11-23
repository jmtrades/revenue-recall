/**
 * Webinar lead lifecycle. One registrant row is one person in one session.
 * Concurrent webinars are separate rows that share an identity (email/phone)
 * so a global opt-out can suppress every session at once.
 */

export type WebinarPhase = "scheduled" | "live" | "ended" | "replay";

export type RegistrantState =
  | "registered"
  | "reminded"
  | "in_room"
  | "left"
  | "pitch_drop"
  | "no_show"
  | "replay"
  | "attended"
  | "follow_up"
  | "booked"
  | "opted_out"
  | "exhausted"
  | "wrong_number";

export type ActionChannel = "call" | "sms" | "email";

export type ActionStatus = "pending" | "sending" | "sent" | "skipped" | "cancelled" | "failed";

export type ActionPurpose = "rejoin" | "replay" | "book" | "reminder" | "followup";

export interface WebinarSession {
  id: string;
  provider: string;
  title: string;
  phase: WebinarPhase;
  timezone?: string;
  startsAt?: string;
  endsAt?: string;
  /** When the pitch/offer is delivered. A leave inside the offer window is a pitch drop. */
  offerAt?: string;
  rejoinUrl?: string;
  replayUrl?: string;
}

export interface Consent {
  call: boolean;
  sms: boolean;
  /** Email is allowed from the registration itself (they gave the address for this event). */
  email: boolean;
}

export interface RecoveryAction {
  stepId: string;
  channel: ActionChannel;
  purpose: ActionPurpose;
  dueAt: string;
  status: ActionStatus;
  detail?: string;
  /** Live-room leave call: the person was just in the room, so quiet hours / Sunday do not hold it. */
  liveOverride: boolean;
  /** Ask the voice transport to drop a voicemail if AMD fires. */
  voicemail: boolean;
  sentAt?: string;
  providerId?: string;
}

export interface AttemptCounts {
  call: number;
  sms: number;
  email: number;
  voicemail: number;
}

export interface WebinarRegistrant {
  id: string;
  sessionId: string;
  providerRegistrantId?: string;
  email?: string;
  phone?: string;
  name?: string;
  timezone?: string;
  contactId?: string;
  rejoinUrl?: string;
  state: RegistrantState;
  consent: Consent;
  doNotContact: boolean;
  phoneInvalid: boolean;
  present: boolean;
  joinCount: number;
  leaveCount: number;
  late: boolean;
  watchedReplay: boolean;
  replayCompleted: boolean;
  voicemailDropped: boolean;
  lastEventAt?: string;
  attempts: AttemptCounts;
  /** Local calendar day (lead timezone) the `day` counters belong to. */
  dayKey: string;
  day: { call: number; sms: number; email: number };
  actions: RecoveryAction[];
  version: number;
  recoveryActive: boolean;
  recoveryReason?: string;
  cancelledReason?: string;
}

export type CanonicalType =
  | "session.upsert"
  | "registrant.registered"
  | "attendance.joined"
  | "attendance.left"
  | "attendance.replay_started"
  | "attendance.replay_completed"
  | "outcome.call"
  | "outcome.sms"
  | "outcome.email"
  | "outcome.booked"
  | "outcome.opt_out";

export type CallClass =
  | "no_answer"
  | "busy"
  | "voicemail"
  | "wrong_number"
  | "hangup"
  | "connected"
  | "booked"
  | "failed"
  | "opt_out";

export interface CanonicalEvent {
  dedupeKey: string;
  provider: string;
  type: CanonicalType;
  occurredAt: string;
  session: Partial<WebinarSession> & { id: string };
  registrant?: {
    id?: string;
    email?: string;
    phone?: string;
    name?: string;
    timezone?: string;
    contactId?: string;
    consent?: Partial<Consent>;
    doNotContact?: boolean;
    rejoinUrl?: string;
  };
  callOutcome?: string;
  callClass?: CallClass;
  durationSec?: number;
  message?: string;
  nearOffer?: boolean;
  duringReplay?: boolean;
}

export interface WebinarConfig {
  maxCallsPerDay: number;
  maxSmsPerDay: number;
  maxEmailsPerDay: number;
  maxCallsPerSession: number;
  maxSmsPerSession: number;
  maxEmailsPerSession: number;
  maxVoicemailDrops: number;
  quietStartHour: number;
  quietEndHour: number;
  blockSunday: boolean;
  requireCallConsent: boolean;
  requireSmsConsent: boolean;
  liveCallOverride: boolean;
  lateJoinAfterSec: number;
  offerWindowSec: number;
  defaultTimezone: string;
  /** When true, email also waits for the lead's quiet-hours window. Default off:
   *  a letter does not ring. Calls and SMS always wait. */
  emailQuiet: boolean;
}

export const TERMINAL_STATES: ReadonlySet<RegistrantState> = new Set(["booked", "opted_out", "exhausted"]);
