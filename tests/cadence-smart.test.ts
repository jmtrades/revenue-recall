import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enroll, runDueSteps, addressFor, __resetEnrollmentsForTests } from "@/lib/cadence";
import type { Contact } from "@/lib/crm/types";

function contact(points: Contact["points"]): Contact {
  return { id: "c", name: "Test", points };
}

describe("addressFor (channel reachability)", () => {
  const full = contact([{ channel: "email", value: "a@b.com" }, { channel: "phone", value: "+15550100" }]);
  it("resolves the right point per channel", () => {
    expect(addressFor(full, "email")).toBe("a@b.com");
    expect(addressFor(full, "sms")).toBe("+15550100");
    expect(addressFor(full, "call")).toBe("+15550100");
  });
  it("returns undefined when the needed channel is missing", () => {
    expect(addressFor(contact([{ channel: "email", value: "a@b.com" }]), "sms")).toBeUndefined();
    expect(addressFor(contact([{ channel: "phone", value: "+1" }]), "email")).toBeUndefined();
    expect(addressFor(undefined, "email")).toBeUndefined();
  });
  it("treats an sms-channel point as reachable for sms/call", () => {
    expect(addressFor(contact([{ channel: "sms", value: "+1" }]), "sms")).toBe("+1");
  });
});

describe("cadence quiet-hours hold", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.SEQUENCE_AUTOPILOT = "true";
    __resetEnrollmentsForTests();
  });
  afterEach(() => {
    delete process.env.SEQUENCE_AUTOPILOT;
    delete process.env.AGENT_QUIET_START_UTC;
    delete process.env.AGENT_QUIET_END_UTC;
  });

  // A future timestamp at 10:00 UTC, so day-0 steps are due and we control the hour.
  const at10utc = () => `${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}T10:00:00Z`;

  it("holds auto-sends to Approvals during quiet hours instead of firing", async () => {
    process.env.AGENT_QUIET_START_UTC = "0";
    process.env.AGENT_QUIET_END_UTC = "23"; // 10:00 is inside → quiet

    const r = await enroll("recall", "recall_queue");
    expect(r.enrolled).toBeGreaterThan(0);

    const tick = await runDueSteps(at10utc());
    expect(tick.due).toBeGreaterThan(0);
    expect(tick.sent).toBe(0); // autopilot ON, but held by quiet hours
    expect(tick.queued).toBe(tick.due); // queued for review instead
  });

  it("auto-sends outside quiet hours when autopilot is on", async () => {
    process.env.AGENT_QUIET_START_UTC = "0";
    process.env.AGENT_QUIET_END_UTC = "5"; // 10:00 is outside → not quiet

    const r = await enroll("recall", "recall_queue");
    expect(r.enrolled).toBeGreaterThan(0);

    const tick = await runDueSteps(at10utc());
    expect(tick.due).toBeGreaterThan(0);
    // Outside quiet hours, autopilot delivers — EXCEPT messages the claim-guard
    // holds for human review (a draft making a financial representation, e.g.
    // "comps"/"home value"), which queue to Approvals. So sent + queued == due,
    // and most still auto-send.
    expect(tick.sent + tick.queued).toBe(tick.due);
    expect(tick.sent).toBeGreaterThan(0);
  });
});
