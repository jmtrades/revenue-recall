import { hashKey } from "@/lib/webinar/outcomes";
import type { CanonicalEvent, CanonicalType, WebinarPhase } from "@/lib/webinar/types";

/**
 * Provider payloads → one canonical event shape. Unknown events return [] so a
 * provider can send noise without moving the lifecycle. Real-time leave is
 * supported for Zoom, Demio, GoTo Webinar, and the generic webhook. WebinarJam
 * / EverWebinar only document registration + attended (no per-second leave); those
 * map to register/join, and a leave still works if they post the generic shape.
 */

type Dict = Record<string, unknown>;

function isDict(v: unknown): v is Dict {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function iso(v: unknown, fallback: string): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  const s = str(v);
  if (!s) return fallback;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
}

function phaseOf(v: unknown): WebinarPhase | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return undefined;
  if (s.includes("replay")) return "replay";
  if (s.includes("end") || s.includes("finish") || s === "completed") return "ended";
  if (s.includes("live") || s.includes("start") || s === "in_progress") return "live";
  if (s.includes("schedul") || s === "upcoming") return "scheduled";
  return undefined;
}

function consentOf(v: unknown): { call?: boolean; sms?: boolean; email?: boolean } | undefined {
  if (!isDict(v)) return undefined;
  const truthy = (x: unknown) => x === true || x === "true" || x === "yes" || x === 1 || x === "1";
  const out: { call?: boolean; sms?: boolean; email?: boolean } = {};
  if ("call" in v) out.call = truthy(v.call);
  if ("sms" in v || "text" in v) out.sms = truthy(v.sms ?? v.text);
  if ("email" in v) out.email = truthy(v.email);
  return out;
}

const JOIN = /join|joined|enter|entered|attended|in_room|participant_joined|registrant.joined/i;
const LEAVE = /leave|left|exit|drop|participant_left|registrant.left/i;
const REPLAY_DONE = /replay.*(complete|completed|finished)|replay_completed/i;
const REPLAY = /replay/i;
const REGISTER = /regist|sign[\s_-]?up|subscribed/i;
const END = /webinar.ended|session.ended|ended|finished/i;
const BOOK = /booked|appointment|scheduled_call/i;
const OPTOUT = /opt[\s_-]?out|unsubscrib|do[\s_-]?not[\s_-]?contact/i;

function typeFromName(name: string): CanonicalType | undefined {
  const n = name.toLowerCase();
  if (OPTOUT.test(n)) return "outcome.opt_out";
  if (BOOK.test(n)) return "outcome.booked";
  if (REPLAY_DONE.test(n)) return "attendance.replay_completed";
  if (REPLAY.test(n) && /drop|leave|left/.test(n)) return "attendance.left";
  if (REPLAY.test(n)) return "attendance.replay_started";
  if (LEAVE.test(n)) return "attendance.left";
  if (JOIN.test(n)) return "attendance.joined";
  if (REGISTER.test(n)) return "registrant.registered";
  if (END.test(n)) return "session.upsert";
  if (n === "session.upsert" || n === "session.live" || n === "session.scheduled") return "session.upsert";
  if (n.startsWith("attendance.") || n.startsWith("registrant.") || n.startsWith("outcome.") || n.startsWith("session.")) {
    return n as CanonicalType;
  }
  return undefined;
}

function dedupe(provider: string, id: string | undefined, type: string, sessionId: string, who: string, occurredAt: string): string {
  if (id) return `${provider}:${id}`;
  return `${provider}:${hashKey([type, sessionId, who, occurredAt])}`;
}

function personOf(raw: Dict): CanonicalEvent["registrant"] {
  const nested = isDict(raw.registrant) ? raw.registrant : isDict(raw.participant) ? raw.participant : isDict(raw.contact) ? raw.contact : raw;
  const email = str(nested.email) ?? str(raw.email);
  const phone = str(nested.phone) ?? str(nested.phone_number) ?? str(raw.phone) ?? str(raw.phone_number);
  const name = str(nested.name) ?? [str(nested.first_name) ?? str(nested.firstName), str(nested.last_name) ?? str(nested.lastName)].filter(Boolean).join(" ") ?? str(raw.name);
  return {
    id: str(nested.id) ?? str(nested.registrant_id) ?? str(nested.registrantKey) ?? str(raw.registrant_id),
    email,
    phone,
    name: name || undefined,
    timezone: str(nested.timezone) ?? str(nested.tz) ?? str(raw.timezone),
    contactId: str(nested.contactId) ?? str(nested.contact_id),
    consent: consentOf(nested.consent) ?? consentOf(raw.consent),
    doNotContact: nested.doNotContact === true || raw.doNotContact === true || nested.dnc === true,
    rejoinUrl: str(nested.rejoinUrl) ?? str(nested.join_link) ?? str(raw.rejoinUrl) ?? str(raw.join_link),
  };
}

export function normalizeWebinarEvents(provider: string, body: unknown, now = new Date()): CanonicalEvent[] {
  const p = provider.toLowerCase();
  if (p === "zoom") return normalizeZoom(body, now);
  if (p === "demio") return normalizeDemio(body, now);
  if (p === "webinarjam" || p === "everwebinar") return normalizeWebinarJam(body, now);
  if (p === "goto" || p === "gotowebinar") return normalizeGoto(body, now);
  if (p === "livestorm") return normalizeLivestorm(body, now);
  if (p === "webinargeek") return normalizeWebinarGeek(body, now);
  if (p === "bigmarker") return normalizeBigMarker(body, now);
  if (p === "zoho" || p === "zohowebinar" || p === "zohomeeting") return normalizeZoho(body, now);
  // ClickMeeting, ON24, Kajabi, Kartra, HighLevel, Riverside, YouTube, Vimeo,
  // StreamYard: no documented per-viewer leave. A generic-shaped POST still maps.
  return normalizeGeneric(body, now, p || "generic");
}

function normalizeGeneric(body: unknown, now: Date, provider: string): CanonicalEvent[] {
  if (Array.isArray(body)) return body.flatMap((item) => normalizeGeneric(item, now, provider));
  if (!isDict(body)) return [];
  // Zoom validation and other envelopes that aren't generic events.
  if (str(body.event) === "endpoint.url_validation") return [];
  const typeName = str(body.type) ?? str(body.event) ?? str(body.event_type) ?? str(body.eventName) ?? "";
  const type = typeFromName(typeName);
  if (!type) return [];
  const sessionRaw = isDict(body.session) ? body.session : body;
  const sessionId = str(sessionRaw.id) ?? str(sessionRaw.sessionId) ?? str(sessionRaw.webinar_id) ?? str(sessionRaw.webinarId) ?? str(body.webinar_id) ?? "session";
  const occurredAt = iso(body.occurredAt ?? body.occurred_at ?? body.timestamp ?? body.time, now.toISOString());
  const registrant = type === "session.upsert" ? undefined : personOf(body);
  const who = registrant?.email ?? registrant?.phone ?? registrant?.id ?? "session";
  const phase = phaseOf(sessionRaw.phase) ?? phaseOf(body.phase) ?? (type === "attendance.left" || type === "attendance.joined" ? "live" : type === "session.upsert" && END.test(typeName) ? "ended" : undefined);
  return [
    {
      dedupeKey: dedupe(provider, str(body.id) ?? str(body.event_id) ?? str(body.eventId), type, sessionId, who, occurredAt),
      provider,
      type: type === "session.upsert" ? "session.upsert" : type,
      occurredAt,
      session: {
        id: sessionId,
        title: str(sessionRaw.title) ?? str(sessionRaw.topic) ?? str(body.topic) ?? str(body.webinar_name),
        phase,
        timezone: str(sessionRaw.timezone) ?? str(body.timezone),
        startsAt: str(sessionRaw.startsAt) ?? str(sessionRaw.starts_at) ?? str(body.starts_at),
        endsAt: str(sessionRaw.endsAt) ?? str(sessionRaw.ends_at) ?? str(body.ends_at),
        offerAt: str(sessionRaw.offerAt) ?? str(sessionRaw.offer_at) ?? str(body.offer_at),
        rejoinUrl: str(sessionRaw.rejoinUrl) ?? str(sessionRaw.join_url) ?? str(body.join_url),
        replayUrl: str(sessionRaw.replayUrl) ?? str(sessionRaw.replay_url) ?? str(body.replay_url),
      },
      registrant,
      callOutcome: str(body.outcome) ?? str(body.callOutcome),
      message: str(body.message) ?? str(body.body) ?? str(body.text),
      nearOffer: body.nearOffer === true || body.near_offer === true,
      duringReplay: body.duringReplay === true || body.during_replay === true || /replay/.test(typeName) && /leave|left|drop/.test(typeName),
    },
  ];
}

function normalizeZoom(body: unknown, now: Date): CanonicalEvent[] {
  if (!isDict(body)) return [];
  const rawEvent = str(body.event) ?? "";
  if (rawEvent === "endpoint.url_validation") return [];
  // Meetings use the same participant envelope as webinars.
  const event = rawEvent.startsWith("meeting.") ? rawEvent.replace("meeting.", "webinar.") : rawEvent;
  const payload = isDict(body.payload) ? body.payload : {};
  const object = isDict(payload.object) ? payload.object : {};
  const sessionId = str(object.id) ?? str(object.uuid) ?? "zoom";
  const occurredAt = iso(body.event_ts, now.toISOString());
  const participant = isDict(object.participant) ? object.participant : isDict(object.registrant) ? object.registrant : {};
  let type: CanonicalType | undefined;
  if (event === "webinar.participant_joined") type = "attendance.joined";
  else if (event === "webinar.participant_left") type = "attendance.left";
  else if (event === "webinar.registration_created") type = "registrant.registered";
  else if (event === "webinar.ended" || event === "webinar.updated" && str(object.status)?.toLowerCase() === "ended") type = "session.upsert";
  else return [];
  const email = str(participant.email);
  const id = str(participant.registrant_id) ?? str(participant.id) ?? str(participant.user_id);
  const who = email ?? id ?? "session";
  const eventId = str(body.event_ts) ? `${rawEvent}:${sessionId}:${who}:${String(body.event_ts)}` : undefined;
  return [
    {
      dedupeKey: dedupe("zoom", eventId, type, sessionId, who, occurredAt),
      provider: "zoom",
      type,
      occurredAt,
      session: {
        id: sessionId,
        title: str(object.topic),
        phase: type === "session.upsert" ? "ended" : "live",
        startsAt: str(object.start_time),
        timezone: str(object.timezone),
      },
      registrant:
        type === "session.upsert"
          ? undefined
          : {
              id,
              email,
              phone: str(participant.phone) ?? str(participant.phone_number),
              name: str(participant.user_name) ?? ([str(participant.first_name), str(participant.last_name)].filter(Boolean).join(" ") || undefined),
              consent: consentOf(participant.consent),
            },
    },
  ];
}

function normalizeDemio(body: unknown, now: Date): CanonicalEvent[] {
  if (!isDict(body)) return [];
  const name = str(body.event) ?? str(body.type) ?? str(body.action) ?? "";
  const type = typeFromName(name.includes(".") ? name : `attendance.${name}`);
  if (!type) return [];
  const sessionId = str(body.webinar_id) ?? str(body.webinarId) ?? str(body.event_id) ?? "demio";
  const occurredAt = iso(body.timestamp ?? body.date ?? body.occurred_at, now.toISOString());
  const email = str(body.email);
  return [
    {
      dedupeKey: dedupe("demio", str(body.id), type, sessionId, email ?? str(body.phone) ?? "session", occurredAt),
      provider: "demio",
      type,
      occurredAt,
      session: {
        id: sessionId,
        title: str(body.name) ?? str(body.webinar_name),
        phase: type === "session.upsert" ? "ended" : type.startsWith("attendance") ? "live" : undefined,
        rejoinUrl: str(body.join_link) ?? str(body.room_link),
        replayUrl: str(body.replay_link),
      },
      registrant: {
        email,
        name: str(body.name) && !str(body.webinar_name) ? str(body.name) : str(body.registrant_name),
        phone: str(body.phone),
        consent: consentOf(body.consent),
      },
    },
  ];
}

function normalizeWebinarJam(body: unknown, now: Date): CanonicalEvent[] {
  if (!isDict(body)) return [];
  // Their documented hooks are registration and attended. Also accept a generic leave if present.
  const name = str(body.event_type) ?? str(body.type) ?? str(body.event) ?? "registration";
  const type = typeFromName(name) ?? (name.toLowerCase() === "attended" ? "attendance.joined" : undefined);
  if (!type) return [];
  const sessionId = str(body.webinar_id) ?? str(body.webinarId) ?? "webinarjam";
  const occurredAt = iso(body.date ?? body.timestamp, now.toISOString());
  const email = str(body.email);
  const phone = str(body.phone);
  return [
    {
      dedupeKey: dedupe("webinarjam", str(body.id), type, sessionId, email ?? phone ?? "session", occurredAt),
      provider: "webinarjam",
      type,
      occurredAt,
      session: {
        id: sessionId,
        title: str(body.webinar_name) ?? str(body.name),
        phase: type === "attendance.joined" ? "live" : type === "attendance.left" ? "live" : undefined,
        rejoinUrl: str(body.live_room_url) ?? str(body.join_link),
        replayUrl: str(body.replay_url),
      },
      registrant: {
        email,
        phone,
        name: [str(body.first_name), str(body.last_name)].filter(Boolean).join(" ") || str(body.name),
        consent: consentOf(body.consent),
      },
    },
  ];
}

function normalizeGoto(body: unknown, now: Date): CanonicalEvent[] {
  if (!isDict(body)) return [];
  const name = str(body.eventName) ?? str(body.event) ?? "";
  const type = typeFromName(name);
  if (!type) return [];
  const sessionId = str(body.webinarKey) ?? str(body.webinarId) ?? "goto";
  const occurredAt = iso(body.timestamp ?? body.eventTime, now.toISOString());
  const email = str(body.email);
  return [
    {
      dedupeKey: dedupe("goto", str(body.eventKey) ?? str(body.id), type, sessionId, email ?? str(body.registrantKey) ?? "session", occurredAt),
      provider: "goto",
      type,
      occurredAt,
      session: {
        id: sessionId,
        title: str(body.webinarTitle),
        phase: type.startsWith("attendance") ? "live" : type === "session.upsert" ? "ended" : undefined,
        rejoinUrl: str(body.joinUrl),
      },
      registrant: {
        id: str(body.registrantKey),
        email,
        phone: str(body.phone),
        name: [str(body.firstName), str(body.lastName)].filter(Boolean).join(" ") || undefined,
        consent: consentOf(body.consent),
      },
    },
  ];
}

function normalizeLivestorm(body: unknown, now: Date): CanonicalEvent[] {
  if (!isDict(body)) return [];
  const data = isDict(body.data) ? body.data : body;
  const meta = isDict(body.meta) ? body.meta : isDict(data.meta) ? data.meta : {};
  const hook = isDict(meta.webhook) ? meta.webhook : {};
  const event = str(hook.event) ?? str(body.event) ?? "";
  const attrs = isDict(data.attributes) ? data.attributes : {};
  const detail = isDict(attrs.registrant_detail) ? attrs.registrant_detail : {};
  const sessionId = str(detail.session_id) ?? str(attrs.event_id) ?? str(data.id) ?? "livestorm";
  const occurredAt = iso(attrs.updated_at ?? attrs.created_at ?? attrs.ended_at, now.toISOString());
  const email = str(attrs.email);
  const name = [str(attrs.first_name), str(attrs.last_name)].filter(Boolean).join(" ") || undefined;
  let type: CanonicalType | undefined;
  if (event === "people.registered") type = "registrant.registered";
  else if (event === "people.watched_replay") type = "attendance.replay_started";
  else if (event === "people.not_attended") type = "registrant.registered";
  else if (event === "session.started") type = "session.upsert";
  else if (event === "session.ended") type = "session.upsert";
  else if (event === "people.attended") type = "attendance.joined";
  else return normalizeGeneric(body, now, "livestorm");
  const phase: WebinarPhase | undefined = event === "session.ended" || event === "people.not_attended" || event === "people.attended" ? "ended" : event === "session.started" ? "live" : undefined;
  return [
    {
      dedupeKey: dedupe("livestorm", str(hook.id) ?? str(data.id), type, sessionId, email ?? "session", occurredAt),
      provider: "livestorm",
      type,
      occurredAt,
      session: { id: sessionId, title: str(attrs.name), phase, rejoinUrl: str(attrs.room_link) ?? str(detail.connection_link) },
      registrant: type === "session.upsert" ? undefined : { email, name, timezone: str(attrs.timezone) },
    },
  ];
}

function normalizeWebinarGeek(body: unknown, now: Date): CanonicalEvent[] {
  if (!isDict(body)) return [];
  const entity = isDict(body.entity) ? body.entity : body;
  const event = (str(body.event) ?? "").toLowerCase();
  const sessionId = str(entity.webinar_id) ?? str(entity.broadcast_id) ?? str(body.webinar_id) ?? "webinargeek";
  const occurredAt = iso(body.timestamp, now.toISOString());
  const email = str(entity.email) ?? str(entity.attendee_email) ?? str(body.email);
  let type: CanonicalType | undefined;
  if (/unsubscrib/.test(event)) type = "outcome.opt_out";
  else if (/replay/.test(event)) type = "attendance.replay_started";
  else if (/started/.test(event)) type = "attendance.joined";
  else if (/subscribed|registration/.test(event)) type = "registrant.registered";
  // "new viewer" is WebinarGeek's after-they-leave signal (up to 2 hours late).
  else if (/viewer/.test(event)) type = "attendance.left";
  else return normalizeGeneric(body, now, "webinargeek");
  return [
    {
      dedupeKey: dedupe("webinargeek", str(body.id), type, sessionId, email ?? "session", occurredAt),
      provider: "webinargeek",
      type,
      occurredAt,
      session: { id: sessionId, phase: type === "attendance.left" || type === "attendance.joined" ? "live" : undefined },
      registrant: { email, name: [str(entity.first_name), str(entity.last_name)].filter(Boolean).join(" ") || str(entity.name), phone: str(entity.phone), consent: consentOf(entity.consent) ?? consentOf(body.consent) },
    },
  ];
}

function normalizeBigMarker(body: unknown, now: Date): CanonicalEvent[] {
  if (!isDict(body)) return [];
  if (isDict(body.registration)) {
    const r = body.registration;
    const sessionId = str(r.conference_id) ?? "bigmarker";
    const occurredAt = iso(r.time_stamp, now.toISOString());
    const email = str(r.email);
    return [
      {
        dedupeKey: dedupe("bigmarker", str(r.bmid), "registrant.registered", sessionId, email ?? "session", occurredAt),
        provider: "bigmarker",
        type: "registrant.registered",
        occurredAt,
        session: { id: sessionId, rejoinUrl: str(r.enter_url) },
        registrant: { id: str(r.bmid), email, name: [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ") || undefined },
      },
    ];
  }
  if (Array.isArray(body.attendees)) {
    // Posted when the session ends, with enter/leave times. Not a live leave.
    return (body.attendees as unknown[]).flatMap((row) => {
      if (!isDict(row)) return [];
      const sessionId = str(row.conference_id) ?? "bigmarker";
      const email = str(row.email);
      const occurredAt = iso(row.last_leave_time ?? row.enter_time, now.toISOString());
      return [
        {
          dedupeKey: dedupe("bigmarker", str(row.bmid), "attendance.joined", sessionId, email ?? "session", occurredAt),
          provider: "bigmarker",
          type: "attendance.joined" as const,
          occurredAt,
          session: { id: sessionId, title: str(row.webinar_title), phase: "ended" as const },
          registrant: { id: str(row.bmid), email, name: [str(row.first_name), str(row.last_name)].filter(Boolean).join(" ") || undefined },
        },
      ];
    });
  }
  return normalizeGeneric(body, now, "bigmarker");
}

function normalizeZoho(body: unknown, now: Date): CanonicalEvent[] {
  if (!isDict(body)) return [];
  const event = (str(body.event) ?? str(body.event_type) ?? str(body.trigger) ?? "").toLowerCase();
  const sessionId = str(body.webinar_id) ?? str(body.webinarId) ?? str(body.meeting_key) ?? "zoho";
  const occurredAt = iso(body.timestamp ?? body.time, now.toISOString());
  const email = str(body.email) ?? str(body.member_email);
  let type: CanonicalType | undefined;
  let phase: WebinarPhase | undefined;
  if (event.includes("registered")) type = "registrant.registered";
  else if (event.includes("joined")) {
    type = "attendance.joined";
    phase = "live";
  } else if (event.includes("removed") || event.includes("left")) {
    type = "attendance.left";
    phase = "live";
  } else if (event.includes("ended")) {
    type = "session.upsert";
    phase = "ended";
  } else if (event.includes("started")) {
    type = "session.upsert";
    phase = "live";
  } else return normalizeGeneric(body, now, "zoho");
  return [
    {
      dedupeKey: dedupe("zoho", str(body.id), type, sessionId, email ?? "session", occurredAt),
      provider: "zoho",
      type,
      occurredAt,
      session: { id: sessionId, title: str(body.topic) ?? str(body.webinar_title), phase },
      registrant: type === "session.upsert" ? undefined : { email, name: str(body.name) ?? str(body.member_name), phone: str(body.phone) },
    },
  ];
}

/**
 * Demio's participants report, pulled after a session. "left early" is not a
 * live webhook. phase is ended so the call is a normal recovery, not a
 * live-room override.
 */
export function demioReportToEvents(dateId: string, body: unknown, now = new Date()): CanonicalEvent[] {
  if (!isDict(body) || !Array.isArray(body.participants)) return [];
  const events: CanonicalEvent[] = [];
  for (const row of body.participants) {
    if (!isDict(row)) continue;
    const status = (str(row.status) ?? "").toLowerCase();
    const email = str(row.email);
    const occurredAt = now.toISOString();
    if (status === "left early") {
      events.push({
        dedupeKey: dedupe("demio", undefined, "attendance.left", dateId, email ?? "session", `${status}:${email ?? ""}`),
        provider: "demio",
        type: "attendance.left",
        occurredAt,
        session: { id: dateId, phase: "ended" },
        registrant: { email, name: str(row.name) },
      });
    } else if (status === "did not attend") {
      events.push({
        dedupeKey: dedupe("demio", undefined, "registrant.registered", dateId, email ?? "session", `noshow:${email ?? ""}`),
        provider: "demio",
        type: "registrant.registered",
        occurredAt,
        session: { id: dateId, phase: "ended" },
        registrant: { email, name: str(row.name) },
      });
    }
  }
  if (events.some((e) => e.type === "registrant.registered")) {
    events.push({
      dedupeKey: dedupe("demio", undefined, "session.upsert", dateId, "session", "ended"),
      provider: "demio",
      type: "session.upsert",
      occurredAt: now.toISOString(),
      session: { id: dateId, phase: "ended" },
    });
  }
  return events;
}

/** Zoom's URL-validation handshake. Null when this body isn't one. */
export function zoomValidationToken(body: unknown): string | null {
  if (!isDict(body) || body.event !== "endpoint.url_validation") return null;
  const payload = isDict(body.payload) ? body.payload : {};
  return str(payload.plainToken) ?? null;
}
