import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { SCENARIO_IDS, type ScenarioId } from "@/lib/webinar/scenarios";
import { __resetWebinarForTests, getRegistrant } from "@/lib/webinar/store";
import {
  __setWebinarPortsForTests,
  ingestWebinarEvent,
  onWebinarCallOutcome,
  onWebinarInboundSms,
  tickWebinarRecovery,
  type IngestResult,
  type WebinarPorts,
} from "@/lib/webinar/engine";
import { normalizeWebinarEvents } from "@/lib/webinar/normalize";
import { zoomEncryptedToken, zoomSignature } from "@/lib/webinar/verify";
import type { CanonicalEvent } from "@/lib/webinar/types";

const ORG = "local";

interface Rec {
  calls: { to: string; opener: string; voicemail?: string; meta: Record<string, string> }[];
  sms: { to: string; body: string }[];
  emails: { to: string; subject: string; body: string }[];
  alerts: string[];
  replies: string[];
}

let now: Date;
let rec: Rec;
let failCalls: number;
const savedEnv = { ...process.env };

const sam = {
  email: "sam@example.com",
  phone: "+447700900123",
  name: "Sam Taylor",
  timezone: "UTC",
  consent: { call: true, sms: true, email: true },
};

function installPorts(): void {
  const p: WebinarPorts = {
    now: () => new Date(now.getTime()),
    async placeCall(input) {
      rec.calls.push(input);
      if (failCalls > 0) {
        failCalls -= 1;
        return { ok: false, detail: "provider down" };
      }
      return { ok: true, id: `call_${rec.calls.length}` };
    },
    async sendSms(input) {
      rec.sms.push(input);
      return { ok: true, id: `sms_${rec.sms.length}` };
    },
    async sendEmail(input) {
      rec.emails.push(input);
      return { ok: true, id: `email_${rec.emails.length}` };
    },
    async reply(input) {
      rec.replies.push(input.incoming);
      return { body: `reply:${input.incoming}`, subject: `Re: ${input.title}` };
    },
    async alert(event) {
      rec.alerts.push(event);
    },
  };
  __setWebinarPortsForTests(p);
}

function ev(partial: Partial<CanonicalEvent> & Pick<CanonicalEvent, "type" | "dedupeKey">): CanonicalEvent {
  const session = {
    id: "sess",
    title: "Offer workshop",
    phase: "live" as const,
    timezone: "UTC",
    rejoinUrl: "https://join.example/room",
    replayUrl: "https://join.example/replay",
    ...partial.session,
  };
  return {
    provider: "generic",
    occurredAt: partial.occurredAt ?? now.toISOString(),
    registrant: partial.registrant ?? sam,
    ...partial,
    session,
  };
}

async function regOf(res: IngestResult) {
  expect(res.registrantId).toBeTruthy();
  const row = await getRegistrant(ORG, res.registrantId!);
  expect(row).toBeTruthy();
  return row!;
}

beforeEach(() => {
  __resetWebinarForTests();
  now = new Date("2026-11-25T15:00:00.000Z");
  rec = { calls: [], sms: [], emails: [], alerts: [], replies: [] };
  failCalls = 0;
  installPorts();
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("WEBINAR_") || key.startsWith("ZOOM_")) delete process.env[key];
  }
});

afterEach(() => {
  __setWebinarPortsForTests(null);
  process.env = { ...savedEnv };
});

async function register(extra: Partial<CanonicalEvent> = {}, key = "reg"): Promise<IngestResult> {
  return ingestWebinarEvent(ORG, ev({ type: "registrant.registered", dedupeKey: key, session: { id: extra.session?.id ?? "sess", phase: "scheduled", startsAt: new Date(now.getTime() + 48 * 3_600_000).toISOString(), ...extra.session }, ...extra }));
}

async function goLive(id = "sess"): Promise<void> {
  await ingestWebinarEvent(ORG, ev({ type: "session.upsert", dedupeKey: `live-${id}`, registrant: undefined, session: { id, phase: "live" } }));
}

const scenarios: Record<ScenarioId, () => Promise<void>> = {
  async S01_register_schedules_reminders() {
    const res = await register();
    expect(res.state).toBe("registered");
    const row = await regOf(res);
    const pending = row.actions.filter((a) => a.status === "pending").map((a) => a.stepId);
    expect(pending).toEqual(expect.arrayContaining(["rem-24h-email", "rem-1h-sms", "rem-10m-sms"]));
    expect(rec.calls).toHaveLength(0);
  },

  async S02_join_cancels_reminders() {
    await register();
    await goLive();
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "join" }));
    expect(res.state).toBe("in_room");
    const row = await regOf(res);
    expect(row.actions.filter((a) => a.status === "pending" && a.stepId.startsWith("rem-"))).toHaveLength(0);
  },

  async S03_late_join_flagged() {
    await register({ session: { id: "sess", phase: "scheduled", startsAt: new Date(now.getTime() - 2 * 3_600_000).toISOString() } });
    await goLive();
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "join-late" }));
    const row = await regOf(res);
    expect(row.late).toBe(true);
    expect(row.state).toBe("in_room");
  },

  async S04_leave_immediate_call() {
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "join" }));
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    expect(res.state).toBe("left");
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].opener).toMatch(/Sam/);
    expect(rec.calls[0].meta.webinarRegistrantId).toBe(res.registrantId);
    expect(rec.sms).toHaveLength(0);
    expect(res.latencyMs).toBeDefined();
    expect(res.latencyMs!).toBeLessThan(1000);
  },

  async S05_pitch_drop_copy() {
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "join" }));
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave", session: { id: "sess", phase: "live", offerAt: now.toISOString() } }));
    expect(res.state).toBe("pitch_drop");
    now = new Date(now.getTime() + 45_000);
    await tickWebinarRecovery(ORG);
    expect(rec.sms[0].body).toMatch(/slipped out|useful part/i);
    expect(rec.sms[0].body).toContain("https://join.example/room");
  },

  async S06_rejoin_cancels_recovery() {
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "join" }));
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    expect(rec.calls).toHaveLength(1);
    now = new Date(now.getTime() + 1_000);
    const back = await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "rejoin", occurredAt: now.toISOString() }));
    expect(back.state).toBe("in_room");
    now = new Date(now.getTime() + 24 * 3_600_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(1);
    expect(rec.sms).toHaveLength(0);
  },

  async S07_duplicate_event_noop() {
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "join" }));
    const leave = ev({ type: "attendance.left", dedupeKey: "leave-1" });
    await ingestWebinarEvent(ORG, leave);
    const again = await ingestWebinarEvent(ORG, leave);
    expect(again.duplicate).toBe(true);
    expect(rec.calls).toHaveLength(1);
  },

  async S08_stale_leave_after_rejoin_ignored() {
    await register();
    await goLive();
    const t0 = now.toISOString();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "join", occurredAt: t0 }));
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave", occurredAt: t0 }));
    now = new Date(now.getTime() + 60_000);
    await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "rejoin", occurredAt: now.toISOString() }));
    const stale = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave-late", occurredAt: t0 }));
    expect(stale.ignored).toBe("stale");
    now = new Date(now.getTime() + 3_600_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(1);
  },

  async S09_newer_join_beats_older_leave() {
    await register();
    await goLive();
    const later = new Date(now.getTime() + 60_000).toISOString();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "join", occurredAt: later }));
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "old-leave", occurredAt: now.toISOString() }));
    expect(res.ignored).toBe("stale");
    expect(res.state).toBe("in_room");
    expect(rec.calls).toHaveLength(0);
  },

  async S10_no_answer_accelerates_sms() {
    await register();
    await goLive();
    const left = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    await onWebinarCallOutcome({ orgId: ORG, registrantId: left.registrantId!, stepId: "leave-call-1", outcome: "no-answer" });
    expect(rec.sms).toHaveLength(1);
    expect(rec.sms[0].body).toContain("https://join.example/room");
  },

  async S11_voicemail_script_on_first_call_only() {
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    expect(rec.calls[0].voicemail).toMatch(/dropped off/i);
    now = new Date(now.getTime() + 3 * 60_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(2);
    expect(rec.calls[1].voicemail).toBeUndefined();
  },

  async S12_rejoin_after_no_answer_stops() {
    await register();
    await goLive();
    const left = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    await onWebinarCallOutcome({ orgId: ORG, registrantId: left.registrantId!, stepId: "leave-call-1", outcome: "no-answer" });
    expect(rec.sms).toHaveLength(1);
    now = new Date(now.getTime() + 5_000);
    await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "rejoin", occurredAt: now.toISOString() }));
    now = new Date(now.getTime() + 24 * 3_600_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(1);
    expect(rec.sms).toHaveLength(1);
  },

  async S13_sms_stop_opts_out_all_sessions() {
    await register({}, "a");
    await register({ session: { id: "other", phase: "scheduled", startsAt: new Date(now.getTime() + 48 * 3_600_000).toISOString() }, dedupeKey: "b" }, "b");
    await goLive("sess");
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    await onWebinarInboundSms(ORG, sam.phone, "STOP");
    const a = await getRegistrant(ORG, "sess:e:sam@example.com");
    const b = await getRegistrant(ORG, "other:e:sam@example.com");
    expect(a?.state).toBe("opted_out");
    expect(b?.state).toBe("opted_out");
    const calls = rec.calls.length;
    now = new Date(now.getTime() + 24 * 3_600_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(calls);
  },

  async S14_sms_natural_language_stops_and_replies() {
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    await onWebinarInboundSms(ORG, sam.phone, "Can you send the replay link?");
    expect(rec.replies[0]).toMatch(/replay link/i);
    expect(rec.sms.some((m) => m.body.startsWith("reply:"))).toBe(true);
    const row = await getRegistrant(ORG, "sess:e:sam@example.com");
    expect(row?.state).toBe("follow_up");
    const calls = rec.calls.length;
    now = new Date(now.getTime() + 24 * 3_600_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(calls);
  },

  async S15_booked_terminal() {
    await register();
    await goLive();
    const left = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    const booked = await ingestWebinarEvent(ORG, ev({ type: "outcome.booked", dedupeKey: "booked" }));
    expect(booked.state).toBe("booked");
    now = new Date(now.getTime() + 24 * 3_600_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(1);
    expect(left.registrantId).toBe(booked.registrantId);
  },

  async S16_no_show_never_joined() {
    await register();
    const ended = await ingestWebinarEvent(ORG, ev({ type: "session.upsert", dedupeKey: "end", registrant: undefined, session: { id: "sess", phase: "ended", endsAt: now.toISOString() } }));
    expect(ended.dispatched.every((d) => d.channel !== "call" || d.status !== "sent")).toBe(true);
    const row = await getRegistrant(ORG, "sess:e:sam@example.com");
    expect(row?.state).toBe("no_show");
    now = new Date(now.getTime() + 61_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].opener).toMatch(/missed you/i);
  },

  async S17_replay_stops_live_recovery() {
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    const replay = await ingestWebinarEvent(ORG, ev({ type: "attendance.replay_started", dedupeKey: "replay" }));
    expect(replay.state).toBe("replay");
    const calls = rec.calls.length;
    now = new Date(now.getTime() + 24 * 3_600_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(calls);
    expect(rec.sms).toHaveLength(0);
  },

  async S18_replay_complete_followup() {
    await register();
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.replay_completed", dedupeKey: "done", session: { id: "sess", phase: "replay" } }));
    expect(res.state).toBe("follow_up");
    expect(rec.emails).toHaveLength(0);
    now = new Date(now.getTime() + 15 * 60_000);
    await tickWebinarRecovery(ORG);
    expect(rec.emails).toHaveLength(1);
    expect(rec.emails[0].body).toContain("https://join.example/replay");
  },

  async S19_quiet_hours_defer_scheduled_not_live_leave() {
    now = new Date("2026-11-25T23:30:00.000Z");
    await register({ session: { id: "live", phase: "scheduled", startsAt: new Date(now.getTime() - 3_600_000).toISOString() } });
    await ingestWebinarEvent(ORG, ev({ type: "session.upsert", dedupeKey: "live-on", registrant: undefined, session: { id: "live", phase: "live" } }));
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave", session: { id: "live", phase: "live" } }));
    expect(rec.calls).toHaveLength(1);

    await register({ session: { id: "missed", phase: "scheduled", startsAt: new Date(now.getTime() - 3_600_000).toISOString() } }, "missed-reg");
    await ingestWebinarEvent(ORG, ev({ type: "session.upsert", dedupeKey: "end-missed", registrant: undefined, session: { id: "missed", phase: "ended" } }));
    now = new Date(now.getTime() + 61_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(1);
    const missed = await getRegistrant(ORG, "missed:e:sam@example.com");
    const call = missed?.actions.find((a) => a.stepId === "noshow-call-1");
    expect(call?.status).toBe("pending");
    expect(call?.detail).toBe("quiet_hours");
  },

  async S20_sunday_blocks_scheduled_not_live_leave() {
    now = new Date("2026-11-22T15:00:00.000Z");
    await register({ session: { id: "live", phase: "scheduled", startsAt: new Date(now.getTime() - 3_600_000).toISOString() } });
    await ingestWebinarEvent(ORG, ev({ type: "session.upsert", dedupeKey: "live-on", registrant: undefined, session: { id: "live", phase: "live" } }));
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave", session: { id: "live", phase: "live" } }));
    expect(rec.calls).toHaveLength(1);
    await register({ session: { id: "missed", phase: "scheduled", startsAt: new Date(now.getTime() - 3_600_000).toISOString() } }, "missed-reg");
    await ingestWebinarEvent(ORG, ev({ type: "session.upsert", dedupeKey: "end-missed", registrant: undefined, session: { id: "missed", phase: "ended" } }));
    now = new Date(now.getTime() + 61_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(1);
    const missed = await getRegistrant(ORG, "missed:e:sam@example.com");
    expect(missed?.actions.find((a) => a.stepId === "noshow-call-1")?.detail).toBe("sunday");
  },

  async S21_daily_call_cap_defers() {
    process.env.WEBINAR_MAX_CALLS_PER_DAY = "1";
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    expect(rec.calls).toHaveLength(1);
    now = new Date(now.getTime() + 3 * 60_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(1);
    const row = await getRegistrant(ORG, "sess:e:sam@example.com");
    expect(row?.actions.find((a) => a.stepId === "leave-call-2")?.detail).toBe("daily_cap");
  },

  async S22_missing_consent_skips_call_sends_email() {
    await register({ registrant: { ...sam, consent: { call: false, sms: false, email: true } } });
    await goLive();
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave", registrant: { ...sam, consent: { call: false, sms: false, email: true } } }));
    expect(rec.calls).toHaveLength(0);
    expect(rec.emails).toHaveLength(1);
    expect(rec.emails[0].body).toContain("https://join.example/room");
    expect(res.dispatched.some((d) => d.channel === "call" && d.detail === "no_consent")).toBe(true);
  },

  async S23_duplicate_registration_merges() {
    await register({}, "one");
    await register({}, "two");
    const row = await getRegistrant(ORG, "sess:e:sam@example.com");
    expect(row?.actions.filter((a) => a.stepId.startsWith("rem-"))).toHaveLength(3);
  },

  async S24_concurrent_webinars_isolated_until_opt_out() {
    await register({}, "a");
    await register({ session: { id: "other", phase: "scheduled", startsAt: new Date(now.getTime() + 48 * 3_600_000).toISOString() } }, "b");
    await goLive("sess");
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    const other = await getRegistrant(ORG, "other:e:sam@example.com");
    expect(other?.state).toBe("registered");
    expect(other?.actions.some((a) => a.status === "pending" && a.stepId.startsWith("rem-"))).toBe(true);
    expect(rec.calls).toHaveLength(1);
  },

  async S25_provider_failure_retries_then_sms() {
    failCalls = 2;
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    expect(rec.calls).toHaveLength(2);
    expect(rec.sms).toHaveLength(1);
    expect(rec.alerts).toContain("webinar.provider_failed");
  },

  async S26_wrong_number_stops_calls_keeps_email() {
    await register();
    await goLive();
    const left = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    await onWebinarCallOutcome({ orgId: ORG, registrantId: left.registrantId!, stepId: "leave-call-1", outcome: "wrong-number" });
    expect(rec.emails.length).toBeGreaterThan(0);
    const calls = rec.calls.length;
    now = new Date(now.getTime() + 24 * 3_600_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(calls);
    const row = await getRegistrant(ORG, left.registrantId!);
    expect(row?.phoneInvalid).toBe(true);
    expect(row?.actions.filter((a) => a.channel === "sms" && a.status === "pending")).toHaveLength(0);
  },

  async S27_short_hangup_stops_redial() {
    await register();
    await goLive();
    const left = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    await onWebinarCallOutcome({ orgId: ORG, registrantId: left.registrantId!, stepId: "leave-call-1", outcome: "completed", durationSec: 3 });
    const row = await getRegistrant(ORG, left.registrantId!);
    expect(row?.state).toBe("follow_up");
    expect(row?.actions.filter((a) => a.channel === "call" && a.status === "pending")).toHaveLength(0);
    const calls = rec.calls.length;
    now = new Date(now.getTime() + 3 * 60_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(calls);
  },

  async S28_busy_stays_in_recovery() {
    await register();
    await goLive();
    const left = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    await onWebinarCallOutcome({ orgId: ORG, registrantId: left.registrantId!, stepId: "leave-call-1", outcome: "busy" });
    const row = await getRegistrant(ORG, left.registrantId!);
    expect(row?.state).toBe("left");
    expect(row?.recoveryActive).toBe(true);
    now = new Date(now.getTime() + 3 * 60_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls.length).toBeGreaterThanOrEqual(2);
  },

  async S29_dnc_blocks_every_channel() {
    await register({ registrant: { ...sam, doNotContact: true } });
    await goLive();
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave", registrant: { ...sam, doNotContact: true } }));
    expect(res.ignored === "opted_out" || res.ignored === "do_not_contact" || res.state === "opted_out").toBe(true);
    expect(rec.calls).toHaveLength(0);
    expect(rec.sms.filter((m) => !m.body.startsWith("You're opted out"))).toHaveLength(0);
    expect(rec.emails).toHaveLength(0);
  },

  async S30_leave_before_session_live_ignored() {
    await register();
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave", session: { id: "sess", phase: "scheduled" } }));
    expect(res.ignored).toBe("session_not_live");
    expect(rec.calls).toHaveLength(0);
  },

  async S31_webhook_rejects_bad_signature() {
    process.env.NODE_ENV = "production";
    process.env.WEBINAR_WEBHOOK_SECRET = "sekret";
    const { POST } = await import("@/app/api/webinar/events/route");
    const res = await POST(new Request("http://localhost/api/webinar/events", {
      method: "POST",
      headers: { "content-type": "application/json", "x-webinar-signature": "sha256=deadbeef" },
      body: JSON.stringify({ type: "attendance.left", session: { id: "sess", phase: "live" }, registrant: sam }),
    }));
    expect(res.status).toBe(401);
  },

  async S32_zoom_url_validation() {
    process.env.ZOOM_WEBHOOK_SECRET = "zoomsek";
    const body = JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "plain-123" } });
    const ts = String(Math.floor(Date.now() / 1000));
    const { POST } = await import("@/app/api/webinar/events/route");
    const res = await POST(new Request("http://localhost/api/webinar/events?provider=zoom", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zm-request-timestamp": ts,
        "x-zm-signature": zoomSignature("zoomsek", ts, body),
      },
      body,
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plainToken).toBe("plain-123");
    expect(json.encryptedToken).toBe(zoomEncryptedToken("zoomsek", "plain-123"));
  },

  async S33_zoom_participant_left_normalized() {
    const events = normalizeWebinarEvents("zoom", {
      event: "webinar.participant_left",
      event_ts: Date.parse("2026-11-25T15:00:00.000Z"),
      payload: { object: { id: "999", topic: "Offer workshop", participant: { email: "sam@example.com", user_name: "Sam Taylor" } } },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("attendance.left");
    expect(events[0].session.id).toBe("999");
    expect(events[0].session.phase).toBe("live");
    expect(events[0].registrant?.email).toBe("sam@example.com");
  },

  async S34_leave_to_call_latency_under_one_second() {
    await register();
    await goLive();
    const started = Date.now();
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }), started);
    const elapsed = Date.now() - started;
    expect(rec.calls).toHaveLength(1);
    expect(res.latencyMs!).toBeGreaterThanOrEqual(0);
    expect(res.latencyMs!).toBeLessThan(1000);
    expect(elapsed).toBeLessThan(1000);

    const { POST } = await import("@/app/api/webinar/events/route");
    const routeStarted = Date.now();
    const http = await POST(new Request("http://localhost/api/webinar/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "route-leave",
        type: "attendance.left",
        occurredAt: now.toISOString(),
        session: { id: "route", phase: "live", title: "Offer workshop", rejoinUrl: "https://join.example/room" },
        registrant: sam,
      }),
    }));
    const routeElapsed = Date.now() - routeStarted;
    expect(http.status).toBe(200);
    const body = await http.json();
    expect(body.latencyMs).toBeLessThan(1000);
    expect(routeElapsed).toBeLessThan(1000);
    expect(rec.calls.length).toBeGreaterThanOrEqual(2);
  },

  async S35_demio_webinarjam_goto_normalize() {
    const demio = normalizeWebinarEvents("demio", { event: "left", webinar_id: "d1", email: "sam@example.com", timestamp: "2026-11-25T15:00:00.000Z" });
    expect(demio[0].type).toBe("attendance.left");
    expect(demio[0].session.phase).toBe("live");
    const jam = normalizeWebinarEvents("webinarjam", { event_type: "registration", webinar_id: "w1", email: "sam@example.com", phone: "+447700900123", first_name: "Sam" });
    expect(jam[0].type).toBe("registrant.registered");
    expect(jam[0].registrant?.phone).toBe("+447700900123");
    const goto = normalizeWebinarEvents("goto", { eventName: "registrant.left", webinarKey: "g1", email: "sam@example.com", firstName: "Sam", lastName: "Taylor" });
    expect(goto[0].type).toBe("attendance.left");
    expect(goto[0].registrant?.name).toBe("Sam Taylor");
  },

  async S36_email_reply_stops_recovery() {
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    const res = await ingestWebinarEvent(ORG, ev({ type: "outcome.email", dedupeKey: "mail", message: "Not right now, email me the notes next week" }));
    expect(res.state).toBe("follow_up");
    expect(rec.replies[0]).toMatch(/notes/i);
    expect(rec.emails.some((m) => m.body.startsWith("reply:"))).toBe(true);
    const calls = rec.calls.length;
    now = new Date(now.getTime() + 24 * 3_600_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(calls);
  },

  async S37_session_call_cap() {
    process.env.WEBINAR_MAX_CALLS_PER_SESSION = "1";
    await register();
    await goLive();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    now = new Date(now.getTime() + 3 * 60_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(1);
    const row = await getRegistrant(ORG, "sess:e:sam@example.com");
    expect(row?.actions.find((a) => a.stepId === "leave-call-2")?.status).toBe("skipped");
  },

  async S38_connected_call_moves_to_followup() {
    await register();
    await goLive();
    const left = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    await onWebinarCallOutcome({ orgId: ORG, registrantId: left.registrantId!, stepId: "leave-call-1", outcome: "completed", durationSec: 40 });
    const row = await getRegistrant(ORG, left.registrantId!);
    expect(row?.state).toBe("follow_up");
    expect(row?.actions.some((a) => a.purpose === "rejoin" && a.channel === "call" && a.status === "pending")).toBe(false);
    const calls = rec.calls.length;
    now = new Date(now.getTime() + 3 * 60_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(calls);
  },

  async S39_verbal_opt_out_on_call() {
    await register();
    await goLive();
    const left = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    await onWebinarCallOutcome({ orgId: ORG, registrantId: left.registrantId!, stepId: "leave-call-1", outcome: "completed", optOut: true });
    const row = await getRegistrant(ORG, left.registrantId!);
    expect(row?.state).toBe("opted_out");
    expect(rec.sms.some((m) => m.body.startsWith("You're opted out"))).toBe(true);
    const calls = rec.calls.length;
    now = new Date(now.getTime() + 24 * 3_600_000);
    await tickWebinarRecovery(ORG);
    expect(rec.calls).toHaveLength(calls);
  },

  async S40_live_leave_without_prior_join_still_calls() {
    await register();
    await goLive();
    const res = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "leave" }));
    expect(res.state).toBe("left");
    expect(rec.calls).toHaveLength(1);
    expect(res.latencyMs!).toBeLessThan(1000);
  },

  async S41_replay_drop_near_offer() {
    await register();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.replay_started", dedupeKey: "replay", session: { id: "sess", phase: "replay" } }));
    const res = await ingestWebinarEvent(ORG, ev({
      type: "attendance.left",
      dedupeKey: "rdrop",
      nearOffer: true,
      duringReplay: true,
      session: { id: "sess", phase: "replay", offerAt: now.toISOString() },
    }));
    expect(res.state).toBe("pitch_drop");
    const row = await regOf(res);
    const call = row.actions.find((a) => a.channel === "call" && a.status === "sent");
    expect(call?.liveOverride).toBe(false);
    expect(rec.calls).toHaveLength(1);
  },

  async S42_session_end_then_stale_leave() {
    await register();
    await goLive();
    const joinedAt = now.toISOString();
    await ingestWebinarEvent(ORG, ev({ type: "attendance.joined", dedupeKey: "join", occurredAt: joinedAt }));
    now = new Date(now.getTime() + 30 * 60_000);
    await ingestWebinarEvent(ORG, ev({ type: "session.upsert", dedupeKey: "end", registrant: undefined, session: { id: "sess", phase: "ended", endsAt: now.toISOString() } }));
    const row = await getRegistrant(ORG, "sess:e:sam@example.com");
    expect(row?.state).toBe("attended");
    const stale = await ingestWebinarEvent(ORG, ev({ type: "attendance.left", dedupeKey: "late-leave", occurredAt: joinedAt, session: { id: "sess", phase: "ended" } }));
    expect(stale.ignored).toBe("stale");
    expect(rec.calls).toHaveLength(0);
  },
};

describe("webinar lifecycle scenarios", () => {
  it("documents and implements every scenario id", () => {
    const doc = readFileSync("docs/WEBINAR_SCENARIOS.md", "utf8");
    for (const id of SCENARIO_IDS) {
      expect(doc, id).toContain(id);
      expect(typeof scenarios[id], id).toBe("function");
    }
    expect(Object.keys(scenarios).sort()).toEqual([...SCENARIO_IDS].sort());
  });

  for (const id of SCENARIO_IDS) {
    it(id, async () => {
      await scenarios[id]();
    });
  }
});
