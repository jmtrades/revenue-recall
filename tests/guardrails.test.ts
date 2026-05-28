import { describe, it, expect, beforeEach } from "vitest";
import { hasOptedOut, inCooldown, quietHoursNow, sendGate } from "@/lib/agent/guardrails";
import type { Activity, Contact, Opportunity } from "@/lib/crm/types";

beforeEach(() => {
  delete process.env.AGENT_QUIET_START_UTC;
  delete process.env.AGENT_QUIET_END_UTC;
  delete process.env.AGENT_DAILY_SEND_CAP;
  delete process.env.AGENT_COOLDOWN_DAYS;
});

const contact = (attrs?: Record<string, unknown>): Contact => ({ id: "c1", name: "Jordan", points: [], attributes: attrs as never });
const opp = (tags?: string[]): Opportunity => ({ id: "o1", title: "Deal", pipelineId: "p", stageId: "s", value: 1000, currency: "USD", contactId: "c1", createdAt: "", updatedAt: "", tags });
const act = (over: Partial<Activity>): Activity => ({ id: "a", kind: "email", summary: "", occurredAt: new Date().toISOString(), ...over });

describe("opt-out suppression", () => {
  it("flags do-not-contact attributes and tags", () => {
    expect(hasOptedOut(contact({ doNotContact: true }), opp(), [])).toBe(true);
    expect(hasOptedOut(contact({ status: "Do Not Contact" }), opp(), [])).toBe(true);
    expect(hasOptedOut(contact(), opp(["do-not-contact"]), [])).toBe(true);
    expect(hasOptedOut(contact(), opp(), [])).toBe(false);
  });

  it("flags a prior inbound decline / hostility", () => {
    expect(hasOptedOut(contact(), opp(), [act({ direction: "inbound", summary: "not interested, please remove me" })])).toBe(true);
    expect(hasOptedOut(contact(), opp(), [act({ direction: "inbound", summary: "stop calling me" })])).toBe(true);
    expect(hasOptedOut(contact(), opp(), [act({ direction: "inbound", summary: "sounds good, tell me more" })])).toBe(false);
  });
});

describe("cooldown", () => {
  it("blocks a re-touch within the window, allows it after", () => {
    const now = Date.now();
    const recent = [act({ direction: "outbound", kind: "email", occurredAt: new Date(now - 1 * 86400000).toISOString() })];
    const old = [act({ direction: "outbound", kind: "email", occurredAt: new Date(now - 10 * 86400000).toISOString() })];
    expect(inCooldown(recent, 3, now)).toBe(true);
    expect(inCooldown(old, 3, now)).toBe(false);
    expect(inCooldown(recent, 0, now)).toBe(false); // 0 = no cooldown
  });

  it("ignores inbound and non-outreach activity", () => {
    const now = Date.now();
    expect(inCooldown([act({ direction: "inbound", occurredAt: new Date(now).toISOString() })], 3, now)).toBe(false);
    expect(inCooldown([act({ direction: "outbound", kind: "note", occurredAt: new Date(now).toISOString() })], 3, now)).toBe(false);
  });
});

describe("quiet hours (UTC window)", () => {
  it("is off when unconfigured", () => {
    expect(quietHoursNow(new Date("2026-01-01T03:00:00Z"))).toBe(false);
  });
  it("respects a normal window", () => {
    process.env.AGENT_QUIET_START_UTC = "22";
    process.env.AGENT_QUIET_END_UTC = "8";
    expect(quietHoursNow(new Date("2026-01-01T03:00:00Z"))).toBe(true); // 3am → quiet
    expect(quietHoursNow(new Date("2026-01-01T14:00:00Z"))).toBe(false); // 2pm → fine
  });
});

describe("sendGate", () => {
  it("opt-out blocks even in review mode", () => {
    expect(sendGate({ contact: contact({ optedOut: true }), opp: opp(), activities: [], autonomy: "review", sentSoFar: 0 })).toBe("opted_out");
  });
  it("review mode ignores volume rails (human-gated)", () => {
    const now = Date.now();
    const recent = [act({ direction: "outbound", occurredAt: new Date(now).toISOString() })];
    expect(sendGate({ contact: contact(), opp: opp(), activities: recent, autonomy: "review", sentSoFar: 0 })).toBeNull();
  });
  it("auto mode enforces cooldown and the daily cap", () => {
    process.env.AGENT_DAILY_SEND_CAP = "5";
    const now = new Date("2026-01-01T14:00:00Z");
    const recent = [act({ direction: "outbound", occurredAt: now.toISOString() })];
    expect(sendGate({ contact: contact(), opp: opp(), activities: recent, autonomy: "auto", sentSoFar: 0, now })).toBe("recently_contacted");
    expect(sendGate({ contact: contact(), opp: opp(), activities: [], autonomy: "auto", sentSoFar: 5, now })).toBe("daily_cap");
    expect(sendGate({ contact: contact(), opp: opp(), activities: [], autonomy: "auto", sentSoFar: 0, now })).toBeNull();
  });
});
