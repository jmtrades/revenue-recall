/**
 * Every webinar platform we accept, and the honest way a leave is detected.
 * `webhook_leave` means the vendor POSTs a leave/participant-left event.
 * Anything else cannot dial in under a second unless the beacon snippet is on
 * a page we control. Latency figures are the vendor's delivery, plus our
 * handler (under a second once the POST is in process).
 */

export type LeaveDetection = "webhook_leave" | "beacon" | "post_session" | "generic";

export interface WebinarPlatform {
  id: string;
  label: string;
  /** Env var that arms this platform. Shared fallbacks are applied in platformStatus(). */
  secretEnv: string;
  detection: LeaveDetection;
  /** One sentence an operator can trust. */
  latency: string;
  /** Events to subscribe in the vendor UI, when they have webhooks. */
  subscribe: string[];
  /** Where the webhook goes. Beacon-only platforms still accept a generic POST. */
  webhook: boolean;
}

export const WEBINAR_PLATFORMS: readonly WebinarPlatform[] = [
  {
    id: "zoom",
    label: "Zoom Webinars and Meetings",
    secretEnv: "ZOOM_WEBHOOK_SECRET",
    detection: "webhook_leave",
    latency: "Real-time webhook. participant_left / meeting.participant_left. Zoom usually delivers in a few seconds; we dial in under a second after the POST arrives.",
    subscribe: ["webinar.participant_joined", "webinar.participant_left", "webinar.registration_created", "webinar.ended", "meeting.participant_joined", "meeting.participant_left", "meeting.registration_created", "meeting.ended", "endpoint.url_validation"],
    webhook: true,
  },
  {
    id: "goto",
    label: "GoTo Webinar",
    secretEnv: "GOTO_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "Join is a real-time webhook (registrant.joined). GoTo does not send registrant.left. A voluntary leave is the beacon: pagehide is immediate, a missed heartbeat is about 12 seconds. A relay may also POST attendance.left.",
    subscribe: ["registrant.added", "registrant.joined", "webinar.created", "webinar.changed"],
    webhook: true,
  },
  {
    id: "demio",
    label: "Demio",
    secretEnv: "DEMIO_API_SECRET",
    detection: "post_session",
    latency: "No first-party webhooks. Zapier's Joins Webinar trigger is polled by Zapier, and the participants report only shows \"left early\" after the session. Mid-session leave is the beacon (pagehide immediate, missed heartbeat ~12s). The poll catches left-early and no-shows once Demio has written the report.",
    subscribe: [],
    webhook: false,
  },
  {
    id: "webinarjam",
    label: "WebinarJam",
    secretEnv: "WEBINARJAM_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "Registration and attended webhooks only. No leave event. Beacon: pagehide immediate, missed heartbeat ~12s. Without the snippet there is no mid-session leave.",
    subscribe: ["registration", "attended"],
    webhook: true,
  },
  {
    id: "everwebinar",
    label: "EverWebinar",
    secretEnv: "WEBINARJAM_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "Same API and hooks as WebinarJam (registration and attended). No leave event. Beacon: pagehide immediate, missed heartbeat ~12s.",
    subscribe: ["registration", "attended"],
    webhook: true,
  },
  {
    id: "livestorm",
    label: "Livestorm",
    secretEnv: "LIVESTORM_WEBHOOK_SECRET",
    detection: "post_session",
    latency: "people.attended and people.not_attended fire after the session ends, not when someone walks out. Mid-session leave is the beacon (pagehide immediate, missed heartbeat ~12s).",
    subscribe: ["people.registered", "session.started", "session.ended", "people.attended", "people.not_attended", "people.watched_replay"],
    webhook: true,
  },
  {
    id: "webinargeek",
    label: "WebinarGeek",
    secretEnv: "WEBINARGEK_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "\"New viewer started watching\" fires when they open the page. \"New viewer\" fires up to 2 hours after they leave, which is not a live recovery. Beacon: pagehide immediate, missed heartbeat ~12s.",
    subscribe: ["webinar_subscribed", "new_viewer_started_watching", "new_viewer", "new_replay_viewer", "webinar_unsubscribed"],
    webhook: true,
  },
  {
    id: "bigmarker",
    label: "BigMarker",
    secretEnv: "BIGMARKER_WEBHOOK_SECRET",
    detection: "post_session",
    latency: "Registration is a live webhook. Attendee rows (enter_time, last_leave_time) are posted when the session ends, not at the moment of leave. Mid-session leave is the beacon.",
    subscribe: ["new registration", "live attendee data (end of session)", "webinar end"],
    webhook: true,
  },
  {
    id: "zoho",
    label: "Zoho Webinar / Zoho Meeting",
    secretEnv: "ZOHO_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "webinar_member_joined and webinar_registered are workflow webhooks. webinar_member_removed is a removal, not a voluntary exit. No attendee-left event is documented. Beacon for a real leave.",
    subscribe: ["webinar_registered", "webinar_member_joined", "webinar_member_removed", "webinar_started", "webinar_ended"],
    webhook: true,
  },
  {
    id: "clickmeeting",
    label: "ClickMeeting",
    secretEnv: "CLICKMEETING_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "No verified instant leave webhook. Zapier polls new attendees about every 15 minutes. Beacon for a live leave. A generic attendance.left POST is accepted if you relay one.",
    subscribe: [],
    webhook: true,
  },
  {
    id: "on24",
    label: "ON24",
    secretEnv: "ON24_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "Registrant and attendee signals in common connectors are polled (about 15 minutes), not a per-viewer leave. Beacon only works on a page you control; the ON24 console itself does not run our snippet.",
    subscribe: [],
    webhook: true,
  },
  {
    id: "streamyard",
    label: "StreamYard",
    secretEnv: "WEBINAR_BEACON_TOKEN",
    detection: "beacon",
    latency: "No per-viewer webhook. StreamYard's room will not run third-party JavaScript. The beacon works only if viewers are on a page you own (a wrapper or thank-you page), not inside StreamYard.",
    subscribe: [],
    webhook: false,
  },
  {
    id: "kajabi",
    label: "Kajabi",
    secretEnv: "KAJABI_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "No webinar leave webhook. Kajabi pages accept a custom code snippet, so the beacon can see pagehide (immediate) and a missed heartbeat (~12s).",
    subscribe: [],
    webhook: true,
  },
  {
    id: "kartra",
    label: "Kartra",
    secretEnv: "KARTRA_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "No webinar leave webhook. Beacon on a Kartra page you can edit: pagehide immediate, missed heartbeat ~12s.",
    subscribe: [],
    webhook: true,
  },
  {
    id: "highlevel",
    label: "HighLevel",
    secretEnv: "HIGHLEVEL_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "Workflow outbound webhooks can post a registration. There is no live attendee-left event. Beacon on the funnel page: pagehide immediate, missed heartbeat ~12s.",
    subscribe: ["registration via workflow webhook (generic shape)"],
    webhook: true,
  },
  {
    id: "riverside",
    label: "Riverside",
    secretEnv: "RIVERSIDE_WEBHOOK_SECRET",
    detection: "beacon",
    latency: "Riverside is a recording studio, not a registrant webinar. No audience-leave webhook. Beacon only if viewers are on your page. Otherwise relay a generic attendance.left.",
    subscribe: [],
    webhook: true,
  },
  {
    id: "youtube",
    label: "YouTube Live",
    secretEnv: "WEBINAR_BEACON_TOKEN",
    detection: "beacon",
    latency: "YouTube does not identify live viewers or send a leave. The beacon runs only on a page you own that embeds the stream. A watch on youtube.com itself is invisible to us.",
    subscribe: [],
    webhook: false,
  },
  {
    id: "vimeo",
    label: "Vimeo Live",
    secretEnv: "WEBINAR_BEACON_TOKEN",
    detection: "beacon",
    latency: "No per-viewer leave webhook. Beacon on a page you own that embeds the player. A watch on vimeo.com itself is invisible to us.",
    subscribe: [],
    webhook: false,
  },
  {
    id: "generic",
    label: "Generic leave POST",
    secretEnv: "WEBINAR_WEBHOOK_SECRET",
    detection: "generic",
    latency: "Real-time if the sender POSTs attendance.left as the person leaves. We dial in under a second after that POST. The sender's own delay is theirs.",
    subscribe: ["attendance.left", "attendance.joined", "registrant.registered", "session.upsert"],
    webhook: true,
  },
] as const;

export interface PlatformArm {
  id: string;
  label: string;
  armed: boolean;
  detection: LeaveDetection;
  latency: string;
  secretEnv: string;
}

function envSet(name: string): boolean {
  return Boolean((process.env[name] ?? "").trim());
}

/** Per-platform armed flags. A shared webhook or beacon secret arms platforms that fall back to it. */
export function platformStatus(): PlatformArm[] {
  const shared = envSet("WEBINAR_WEBHOOK_SECRET") || envSet("WEBINAR_BEACON_TOKEN");
  return WEBINAR_PLATFORMS.map((p) => ({
    id: p.id,
    label: p.label,
    armed: envSet(p.secretEnv) || shared,
    detection: p.detection,
    latency: p.latency,
    secretEnv: p.secretEnv,
  }));
}

export function anyWebinarArmed(): boolean {
  return platformStatus().some((p) => p.armed);
}
