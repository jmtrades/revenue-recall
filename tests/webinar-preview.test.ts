import { describe, expect, it } from "vitest";
import { previewDropOff } from "@/lib/webinar/preview";
import { WEBINAR_PLATFORMS } from "@/lib/webinar/platforms";
import { ELEVEN_VOICES } from "@/lib/voice/tts";

const LEAD = {
  type: "attendance.left",
  session: { id: "room-1", title: "Tuesday session", phase: "live" },
  registrant: {
    name: "Junior",
    email: "junior@example.com",
    phone: "+16502885280",
    consent: { call: true, sms: true },
  },
};

describe("drop-off preview", () => {
  it("queues an immediate call and does not claim anything was sent", () => {
    delete process.env.TWILIO_FROM_NUMBER;
    const plan = previewDropOff("generic", LEAD, new Date("2026-11-24T14:00:00Z"));
    expect(plan.dryRun).toBe(true);
    expect(plan.placedCall).toBe(false);
    expect(plan.sentSms).toBe(false);
    expect(plan.sentEmail).toBe(false);
    expect(plan.elevenVoiceId).toBe(ELEVEN_VOICES.af_jessica);
    expect(plan.fromNumber).toBe("+17622405708");
    const call = plan.steps.find((s) => s.stepId === "leave-call-1");
    expect(call?.immediate).toBe(true);
    expect(call?.gate).toBe("ready");
    expect(call?.to).toBe("+16502885280");
    expect(call?.opener).toContain("Junior");
    expect(call?.voicemail).toBeTruthy();
    const sms = plan.steps.find((s) => s.stepId === "leave-sms-1");
    expect(sms?.immediate).toBe(false);
    expect(sms?.to).toBe("+16502885280");
  });

  it("does not queue a call when call consent is missing", () => {
    const plan = previewDropOff("zapier", {
      ...LEAD,
      registrant: { ...LEAD.registrant, consent: { call: false, sms: false } },
    });
    const call = plan.steps.find((s) => s.channel === "call");
    expect(call?.gate).toBe("no_consent");
    expect(call?.immediate).toBe(false);
  });

  it("lists the platforms a host can paste into", () => {
    const ids = WEBINAR_PLATFORMS.map((p) => p.id);
    for (const id of ["zoom", "goto", "demio", "webinarjam", "everwebinar", "streamyard", "webinargeek", "livestorm", "on24", "riverside", "youtube", "zapier"]) {
      expect(ids).toContain(id);
    }
  });
});
