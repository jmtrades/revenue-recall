import { createHmac } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WEBINAR_PLATFORMS } from "@/lib/webinar/platforms";
import { demioReportToEvents, normalizeWebinarEvents } from "@/lib/webinar/normalize";
import { gotoSignature, verifyWebinarRequest, zoomSignature } from "@/lib/webinar/verify";
import { __resetWebinarForTests } from "@/lib/webinar/store";
import { __setWebinarPortsForTests, ingestWebinarEvent, type WebinarPorts } from "@/lib/webinar/engine";

const saved = { ...process.env };

beforeEach(() => {
  __resetWebinarForTests();
  __setWebinarPortsForTests(null);
});
afterEach(() => {
  process.env = { ...saved };
  __setWebinarPortsForTests(null);
});

describe("webinar platform registry", () => {
  it("names a secret, a detection mode, and an honest latency for every platform", () => {
    const ids = new Set<string>();
    for (const p of WEBINAR_PLATFORMS) {
      expect(ids.has(p.id), p.id).toBe(false);
      ids.add(p.id);
      expect(p.secretEnv.length).toBeGreaterThan(0);
      expect(p.latency.length).toBeGreaterThan(20);
      expect(["webhook_leave", "beacon", "post_session", "generic"]).toContain(p.detection);
    }
    expect(ids.has("zoom")).toBe(true);
    expect(ids.has("goto")).toBe(true);
    expect(ids.has("demio")).toBe(true);
    expect(ids.has("webinarjam")).toBe(true);
    expect(ids.has("everwebinar")).toBe(true);
    expect(ids.has("generic")).toBe(true);
  });

  it("only Zoom is documented as a true leave webhook", () => {
    const live = WEBINAR_PLATFORMS.filter((p) => p.detection === "webhook_leave").map((p) => p.id);
    expect(live).toEqual(["zoom"]);
  });
});

describe("platform payloads from vendor docs", () => {
  it("maps a Zoom meeting participant_left the same way as a webinar leave", () => {
    const events = normalizeWebinarEvents("zoom", {
      event: "meeting.participant_left",
      event_ts: Date.parse("2026-11-25T15:00:00.000Z"),
      payload: { object: { id: "42", topic: "Standup", participant: { email: "sam@example.com", user_name: "Sam Taylor" } } },
    });
    expect(events[0].type).toBe("attendance.left");
    expect(events[0].session.phase).toBe("live");
    expect(events[0].registrant?.email).toBe("sam@example.com");
  });

  it("maps GoTo registrant.added and registrant.joined, and still accepts a relayed leave", () => {
    const added = normalizeWebinarEvents("goto", { eventName: "registrant.added", webinarKey: 9, email: "sam@example.com", firstName: "Sam", lastName: "Taylor", timestamp: "2026-11-25T15:00:00.000Z" });
    expect(added[0].type).toBe("registrant.registered");
    const joined = normalizeWebinarEvents("goto", { eventName: "registrant.joined", webinarKey: 9, email: "sam@example.com", joinTime: "2026-11-25T15:01:00.000Z", timestamp: "2026-11-25T15:01:00.000Z" });
    expect(joined[0].type).toBe("attendance.joined");
    const left = normalizeWebinarEvents("goto", { eventName: "registrant.left", webinarKey: 9, email: "sam@example.com", timestamp: "2026-11-25T15:05:00.000Z" });
    expect(left[0].type).toBe("attendance.left");
  });

  it("verifies a GoTo base64 HMAC of timestamp:body", () => {
    process.env.GOTO_WEBHOOK_SECRET = "goto-secret";
    const raw = JSON.stringify({ eventName: "registrant.joined" });
    const ts = String(Date.now());
    const ok = verifyWebinarRequest({
      provider: "goto",
      rawBody: raw,
      headers: new Headers({ "x-webhook-signature": gotoSignature("goto-secret", ts, raw), "x-webhook-signature-timestamp": ts }),
      url: new URL("http://localhost/api/webinar/events?provider=goto"),
    });
    expect(ok.ok).toBe(true);
    const bad = verifyWebinarRequest({
      provider: "goto",
      rawBody: raw,
      headers: new Headers({ "x-webhook-signature": "nope", "x-webhook-signature-timestamp": ts }),
      url: new URL("http://localhost/api/webinar/events?provider=goto"),
    });
    expect(bad.ok).toBe(false);
  });

  it("maps Livestorm people.registered, people.attended, and session.ended", () => {
    const reg = normalizeWebinarEvents("livestorm", {
      data: {
        id: "person-1",
        attributes: { email: "sam@example.com", first_name: "Sam", last_name: "Taylor", registrant_detail: { session_id: "sess-1" } },
        meta: { webhook: { id: "wh-1", event: "people.registered" } },
      },
    });
    expect(reg[0].type).toBe("registrant.registered");
    expect(reg[0].session.id).toBe("sess-1");
    const attended = normalizeWebinarEvents("livestorm", {
      data: { id: "person-1", attributes: { email: "sam@example.com", registrant_detail: { session_id: "sess-1" } }, meta: { webhook: { event: "people.attended" } } },
    });
    expect(attended[0].type).toBe("attendance.joined");
    expect(attended[0].session.phase).toBe("ended");
    const ended = normalizeWebinarEvents("livestorm", {
      data: { id: "sess-1", attributes: { room_link: "https://app.livestorm.co/p/x/live" }, meta: { webhook: { event: "session.ended" } } },
    });
    expect(ended[0].type).toBe("session.upsert");
    expect(ended[0].session.phase).toBe("ended");
  });

  it("maps WebinarGeek subscribe, started watching, and the delayed viewer signal, and checks the Signature header", () => {
    const sub = normalizeWebinarEvents("webinargeek", { id: "1", event: "webinar_subscribed", timestamp: 1730000000000, entity: { email: "sam@example.com", webinar_id: "w1", first_name: "Sam" } });
    expect(sub[0].type).toBe("registrant.registered");
    const started = normalizeWebinarEvents("webinargeek", { id: "2", event: "new_viewer_started_watching", timestamp: 1730000000000, entity: { email: "sam@example.com", webinar_id: "w1" } });
    expect(started[0].type).toBe("attendance.joined");
    const viewer = normalizeWebinarEvents("webinargeek", { id: "3", event: "new_viewer", timestamp: 1730000000000, entity: { email: "sam@example.com", webinar_id: "w1" } });
    expect(viewer[0].type).toBe("attendance.left");

    process.env.WEBINARGEK_WEBHOOK_SECRET = "geek-secret";
    const raw = JSON.stringify({ id: "1", event: "webinar_subscribed" });
    const sig = `sha256=${createHmac("sha256", "geek-secret").update(raw).digest("hex")}`;
    expect(verifyWebinarRequest({
      provider: "webinargeek",
      rawBody: raw,
      headers: new Headers({ signature: sig }),
      url: new URL("http://localhost/api/webinar/events?provider=webinargeek"),
    }).ok).toBe(true);
  });

  it("maps a BigMarker registration and an end-of-session attendee dump", () => {
    const reg = normalizeWebinarEvents("bigmarker", { registration: { bmid: "b1", first_name: "Sam", last_name: "Taylor", email: "sam@example.com", conference_id: "c1", time_stamp: "2026-11-25T15:00:00Z" } });
    expect(reg[0].type).toBe("registrant.registered");
    expect(reg[0].session.rejoinUrl).toBeUndefined();
    const dump = normalizeWebinarEvents("bigmarker", { attendees: [{ bmid: "b1", email: "sam@example.com", conference_id: "c1", webinar_title: "Offer", enter_time: "2026-11-25T15:00:00Z", last_leave_time: "2026-11-25T15:40:00Z" }] });
    expect(dump[0].type).toBe("attendance.joined");
    expect(dump[0].session.phase).toBe("ended");
  });

  it("maps Zoho join, removal, and end", () => {
    expect(normalizeWebinarEvents("zoho", { event: "webinar_member_joined", webinar_id: "z1", email: "sam@example.com" })[0].type).toBe("attendance.joined");
    expect(normalizeWebinarEvents("zoho", { event: "webinar_member_removed", webinar_id: "z1", email: "sam@example.com" })[0].type).toBe("attendance.left");
    expect(normalizeWebinarEvents("zoho", { event: "webinar_ended", webinar_id: "z1" })[0].session.phase).toBe("ended");
  });

  it("turns a Demio participants report into post-session leaves and no-shows", () => {
    const events = demioReportToEvents("date-9", {
      participants: [
        { email: "left@example.com", name: "Left", status: "left early", attended: true },
        { email: "miss@example.com", name: "Miss", status: "did not attend", attended: false },
        { email: "stay@example.com", name: "Stay", status: "completed", attended: true },
      ],
    });
    expect(events.find((e) => e.registrant?.email === "left@example.com")?.type).toBe("attendance.left");
    expect(events.find((e) => e.registrant?.email === "left@example.com")?.session.phase).toBe("ended");
    expect(events.find((e) => e.registrant?.email === "miss@example.com")?.type).toBe("registrant.registered");
    expect(events.some((e) => e.type === "session.upsert" && e.session.phase === "ended")).toBe(true);
    expect(events.some((e) => e.registrant?.email === "stay@example.com")).toBe(false);
  });

  it("accepts a generic leave for YouTube, Vimeo, StreamYard, and HighLevel relays", () => {
    for (const provider of ["youtube", "vimeo", "streamyard", "highlevel", "kajabi", "kartra", "riverside", "clickmeeting", "on24"]) {
      const events = normalizeWebinarEvents(provider, { id: "e1", type: "attendance.left", session: { id: "s", phase: "live" }, registrant: { email: "sam@example.com", phone: "+447700900123", consent: { call: true } } });
      expect(events[0]?.type, provider).toBe("attendance.left");
    }
  });

  it("places a call when a Zoom meeting leave is ingested", async () => {
    const calls: string[] = [];
    const ports: WebinarPorts = {
      now: () => new Date("2026-11-25T15:00:00.000Z"),
      async placeCall(input) {
        calls.push(input.to);
        return { ok: true, id: "c1" };
      },
      async sendSms() { return { ok: true }; },
      async sendEmail() { return { ok: true }; },
      async reply() { return { body: "ok" }; },
      async alert() {},
    };
    __setWebinarPortsForTests(ports);
    const [event] = normalizeWebinarEvents("zoom", {
      event: "meeting.participant_left",
      event_ts: Date.parse("2026-11-25T15:00:00.000Z"),
      payload: { object: { id: "42", topic: "Standup", participant: { email: "sam@example.com", user_name: "Sam", user_id: "u1" } } },
    });
    event.registrant = { ...event.registrant, phone: "+447700900123", consent: { call: true, sms: true } };
    const res = await ingestWebinarEvent("local", event);
    expect(calls).toEqual(["+447700900123"]);
    expect(res.latencyMs!).toBeLessThan(1000);
  });

  it("still accepts a Zoom URL validation signature", () => {
    process.env.ZOOM_WEBHOOK_SECRET = "z";
    const raw = JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "p" } });
    const ts = String(Math.floor(Date.now() / 1000));
    expect(verifyWebinarRequest({
      provider: "zoom",
      rawBody: raw,
      headers: new Headers({ "x-zm-request-timestamp": ts, "x-zm-signature": zoomSignature("z", ts, raw) }),
      url: new URL("http://localhost/api/webinar/events?provider=zoom"),
    }).ok).toBe(true);
  });
});
