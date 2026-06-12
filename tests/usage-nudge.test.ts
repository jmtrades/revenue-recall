import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nudgeStage, nudgeSubject, nudgeBody, runUsageNudge, LOW_FRACTION, type PoolStatus } from "@/lib/billing/usage-nudge";
import { topupPacksFor } from "@/lib/billing/topups";
import { estimatedDialsForMinutes } from "@/lib/billing/voice-minutes";

const SAVED = { ...process.env };
afterEach(() => {
  process.env = { ...SAVED };
});
beforeEach(() => {
  delete process.env.BILLING_ENFORCE;
});

describe("nudgeStage thresholds", () => {
  it("stays quiet with comfortable runway, on unmetered plans, and on plans with no pool", () => {
    expect(nudgeStage(0, 1500)).toBeNull();
    expect(nudgeStage(1199, 1500)).toBeNull(); // 79.9% — just under the line
    expect(nudgeStage(10, Infinity)).toBeNull(); // scale plan — unmetered
    expect(nudgeStage(0, 0)).toBeNull(); // free plan never had minutes to run out of
  });

  it("fires low at 80% and out at the limit", () => {
    expect(nudgeStage(1500 * LOW_FRACTION, 1500)).toBe("low");
    expect(nudgeStage(1499, 1500)).toBe("low");
    expect(nudgeStage(1500, 1500)).toBe("out");
    expect(nudgeStage(1600, 1500)).toBe("out");
  });
});

const MIN_LOW: PoolStatus = { pool: "minutes", stage: "low", remaining: 212, limit: 1500 };
const MIN_OUT: PoolStatus = { pool: "minutes", stage: "out", remaining: 0, limit: 1500 };
const MSG_LOW: PoolStatus = { pool: "messages", stage: "low", remaining: 130, limit: 1500 };
const MSG_OUT: PoolStatus = { pool: "messages", stage: "out", remaining: 0, limit: 1500 };

describe("nudge subject", () => {
  it("leads with minutes (a paused dialer is the louder emergency) and escalates on out", () => {
    expect(nudgeSubject([MIN_LOW])).toBe("Running low: ~212 talk minutes left this month");
    expect(nudgeSubject([MIN_OUT])).toBe("You're out of talk minutes — AI calling is paused");
    expect(nudgeSubject([MIN_LOW, MSG_OUT])).toBe("You're out of AI messages this month"); // worst stage wins, minutes not out
    expect(nudgeSubject([MIN_OUT, MSG_LOW])).toBe("You're out of talk minutes — AI calling is paused");
  });

  it("handles a messages-only nudge", () => {
    expect(nudgeSubject([MSG_LOW])).toBe("Running low: 130 AI messages left this month");
    expect(nudgeSubject([MSG_OUT])).toBe("You're out of AI messages this month");
  });
});

describe("nudge body", () => {
  it("frames minutes in dials (the unit the customer thinks in) and notes no-answers are free", () => {
    const body = nudgeBody([MIN_LOW]);
    expect(body).toContain("Talk minutes: 212 of 1,500 left");
    expect(body).toContain(`≈${estimatedDialsForMinutes(212).toLocaleString("en-US")} more dials`);
    expect(body).toContain("no-answers are free");
  });

  it("quotes the live minute-pack catalog, so a reprice flows into the email", () => {
    const body = nudgeBody([MIN_LOW]);
    for (const p of topupPacksFor("minutes")) expect(body).toContain(`$${p.suggestedUsd}`);
    expect(body).not.toContain("Message packs"); // unaffected pool stays out of the email
  });

  it("tells an out-of-minutes org exactly what is and isn't paused", () => {
    const body = nudgeBody([MIN_OUT]);
    expect(body).toContain("AI calls are paused");
    expect(body).toContain("Everything else keeps running");
  });

  it("explains the Approvals fallback when messages run out, and covers both pools at once", () => {
    const body = nudgeBody([MIN_LOW, MSG_OUT]);
    expect(body).toContain("keeps drafting to Approvals");
    expect(body).toContain("Talk minutes: 212");
    for (const p of topupPacksFor("messages")) expect(body).toContain(`$${p.suggestedUsd}`);
    expect(body).toContain("reset on the 1st");
    expect(body).toContain("/settings?tab=billing");
  });
});

describe("runUsageNudge gating", () => {
  it("is inert when billing isn't enforced (demo / self-hosted)", async () => {
    process.env.BILLING_ENFORCE = "false";
    expect(await runUsageNudge()).toBe("n/a");
  });

  it("requires Supabase for the durable month dedupe even when enforcing", async () => {
    process.env.BILLING_ENFORCE = "true";
    // No Supabase in the test env → n/a (an in-memory dedupe would re-send after every deploy).
    expect(await runUsageNudge()).toBe("n/a");
  });
});
