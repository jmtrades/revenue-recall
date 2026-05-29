import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { channelStatus, sendEmail, sendSms, placeCall, setEmailTransport, setSmsTransport, setVoiceTransport } from "@/lib/comms";

const CLEAR = ["RESEND_API_KEY", "SENDGRID_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "EMAIL_WEBHOOK_URL", "SMS_WEBHOOK_URL", "VOICE_WEBHOOK_URL", "COMMS_WEBHOOK_TOKEN"];

beforeEach(() => {
  for (const k of CLEAR) delete process.env[k];
  setEmailTransport(null);
  setSmsTransport(null);
  setVoiceTransport(null);
});
afterEach(() => {
  setEmailTransport(null);
  setSmsTransport(null);
  setVoiceTransport(null);
});

describe("comms transport resolution", () => {
  it("falls back to 'log' with nothing configured — and still 'sends'", async () => {
    expect(channelStatus()).toEqual({
      email: { provider: "log", live: false },
      sms: { provider: "log", live: false },
      voice: { provider: "log", live: false },
    });
    expect((await sendEmail("a@b.com", "s", "b")).status).toBe("logged");
    expect((await sendSms("+15551234567", "hi")).status).toBe("logged");
    expect((await placeCall("+15551234567")).status).toBe("logged");
  });

  it("reports the generic webhook as live when its URL is set (no vendor lock-in)", () => {
    process.env.EMAIL_WEBHOOK_URL = "https://hooks.example.com/email";
    process.env.SMS_WEBHOOK_URL = "https://hooks.example.com/sms";
    process.env.VOICE_WEBHOOK_URL = "https://hooks.example.com/voice";
    const s = channelStatus();
    expect(s.email).toEqual({ provider: "webhook", live: true });
    expect(s.sms).toEqual({ provider: "webhook", live: true });
    expect(s.voice).toEqual({ provider: "webhook", live: true });
  });

  it("a registered custom transport wins over everything", async () => {
    process.env.RESEND_API_KEY = "re_x"; // built-in would otherwise be chosen
    const calls: string[] = [];
    setEmailTransport({ id: "mine", available: () => true, send: async (m) => { calls.push(m.to); return { id: "x", status: "sent", provider: "mine" }; } });
    expect(channelStatus().email).toEqual({ provider: "mine", live: true });
    const r = await sendEmail("z@b.com", "s", "b");
    expect(r.provider).toBe("mine");
    expect(calls).toEqual(["z@b.com"]);
  });

  it("an unavailable custom transport is skipped in favor of the next option", () => {
    process.env.SMS_WEBHOOK_URL = "https://hooks.example.com/sms";
    setSmsTransport({ id: "mine", available: () => false, send: async () => ({ id: "", status: "failed", provider: "mine" }) });
    expect(channelStatus().sms).toEqual({ provider: "webhook", live: true });
  });

  it("built-in adapters are picked up by env when present", () => {
    process.env.SENDGRID_API_KEY = "sg_x";
    process.env.TWILIO_ACCOUNT_SID = "AC";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM_NUMBER = "+15550000000";
    const s = channelStatus();
    expect(s.email.provider).toBe("sendgrid");
    expect(s.sms.provider).toBe("twilio");
    expect(s.voice.provider).toBe("twilio");
  });
});
