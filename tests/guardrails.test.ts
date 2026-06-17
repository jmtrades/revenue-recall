import { describe, it, expect, beforeEach } from "vitest";
import { hasOptedOut, isHardOptOut, lastSoftDeclineAt, inCooldown, quietHoursNow, sendGate, containsUnverifiedClaim } from "@/lib/agent/guardrails";
import type { Activity, Contact, Opportunity } from "@/lib/crm/types";

beforeEach(() => {
  delete process.env.AGENT_QUIET_START_UTC;
  delete process.env.AGENT_QUIET_END_UTC;
  delete process.env.AGENT_DAILY_SEND_CAP;
  delete process.env.AGENT_COOLDOWN_DAYS;
  delete process.env.AGENT_DECLINE_COOLDOWN_DAYS;
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

  it("only a HARD opt-out permanently suppresses — a soft decline does not", () => {
    // Hard opt-out / hostility → suppressed forever.
    expect(hasOptedOut(contact(), opp(), [act({ direction: "inbound", summary: "please unsubscribe me" })])).toBe(true);
    expect(hasOptedOut(contact(), opp(), [act({ direction: "inbound", summary: "stop calling me" })])).toBe(true);
    expect(hasOptedOut(contact(), opp(), [act({ direction: "inbound", summary: "take me off your list" })])).toBe(true);
    // Soft "no for now" → NOT a permanent opt-out (still winnable, re-engage later).
    expect(hasOptedOut(contact(), opp(), [act({ direction: "inbound", summary: "not interested right now" })])).toBe(false);
    expect(hasOptedOut(contact(), opp(), [act({ direction: "inbound", summary: "we'll pass for now" })])).toBe(false);
  });

  it("isHardOptOut distinguishes permanent from soft", () => {
    expect(isHardOptOut("unsubscribe")).toBe(true);
    expect(isHardOptOut("do not contact me again")).toBe(true);
    expect(isHardOptOut("leave me alone")).toBe(true); // hostile
    expect(isHardOptOut("not interested")).toBe(false);
    expect(isHardOptOut("not for us right now")).toBe(false);
  });
});

describe("soft-decline re-engagement", () => {
  it("finds the most recent soft decline, ignoring hard opt-outs", () => {
    const now = Date.now();
    const iso = new Date(now).toISOString();
    expect(lastSoftDeclineAt([act({ direction: "inbound", summary: "not interested", occurredAt: iso })])).toBe(new Date(iso).getTime());
    expect(lastSoftDeclineAt([act({ direction: "inbound", summary: "unsubscribe" })])).toBeNull();
    expect(lastSoftDeclineAt([act({ direction: "outbound", summary: "not interested" })])).toBeNull();
  });

  it("a declined deal is paused for the cooldown, then followed up again", () => {
    const now = new Date("2026-02-01T14:00:00Z");
    const recentDecline = [act({ direction: "inbound", summary: "not interested right now", occurredAt: new Date(now.getTime() - 5 * 86400000).toISOString() })];
    const oldDecline = [act({ direction: "inbound", summary: "not interested right now", occurredAt: new Date(now.getTime() - 45 * 86400000).toISOString() })];
    // 5 days after a soft no (default 30-day gap) → hold.
    expect(sendGate({ contact: contact(), opp: opp(), activities: recentDecline, autonomy: "auto", sentSoFar: 0, now })).toBe("recently_declined");
    // 45 days later → follow up again (this is the whole point of recall).
    expect(sendGate({ contact: contact(), opp: opp(), activities: oldDecline, autonomy: "auto", sentSoFar: 0, now })).toBeNull();
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

  it("enforces a conservative daily cap BY DEFAULT (no env = not unlimited)", () => {
    // AGENT_DAILY_SEND_CAP is unset (deleted in beforeEach). Autonomous sending
    // must still be capped so it can never run away.
    expect(sendGate({ contact: contact(), opp: opp(), activities: [], autonomy: "auto", sentSoFar: 250, now: new Date("2026-01-01T14:00:00Z") })).toBe("daily_cap");
    expect(sendGate({ contact: contact(), opp: opp(), activities: [], autonomy: "auto", sentSoFar: 249, now: new Date("2026-01-01T14:00:00Z") })).toBeNull();
  });

  it("lets an operator opt out of the cap with AGENT_DAILY_SEND_CAP=0", () => {
    process.env.AGENT_DAILY_SEND_CAP = "0";
    expect(sendGate({ contact: contact(), opp: opp(), activities: [], autonomy: "auto", sentSoFar: 100000, now: new Date("2026-01-01T14:00:00Z") })).toBeNull();
  });
});

describe("containsUnverifiedClaim — claim-guard for autonomous sends", () => {
  it("flags financial representations that must be human-reviewed", () => {
    for (const t of [
      "I pulled fresh comps — you've got more equity than you'd think",
      "rates just dropped to 6.5%, worth a look",
      "you're pre-approved up to 500k",
      "your home value is up this year",
      "we can refinance and cut your payment",
      "appraised higher than expected",
    ]) {
      expect(containsUnverifiedClaim(t), t).toBe(true);
    }
  });

  it("does NOT flag normal copy — incl. a deal's dollar value or rhetorical 100% (autopilot still sends)", () => {
    for (const t of [
      "Hey Jordan — saw your inquiry on the Maple property, still looking?",
      "Do you have 15 minutes Thursday to reconnect?",
      "Following up on your $4,200 quote — still interested?", // bare $ value is fine
      "We're 100% committed to getting you across the line", // rhetorical %, not a rate
      "Mind leaving us a rating if this helped?", // 'rating', not a financial rate
    ]) {
      expect(containsUnverifiedClaim(t), t).toBe(false);
    }
    expect(containsUnverifiedClaim("")).toBe(false);
    expect(containsUnverifiedClaim(undefined)).toBe(false);
  });
})
