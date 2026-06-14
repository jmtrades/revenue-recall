import { describe, it, expect, afterEach } from "vitest";
import { calledTooRecently, manualCallCooldownSec } from "@/lib/agent/guardrails";
import type { Activity } from "@/lib/crm/types";

afterEach(() => {
  delete process.env.MANUAL_CALL_COOLDOWN_SEC;
});

const act = (over: Partial<Activity>): Activity => ({
  id: "a",
  kind: "call",
  summary: "outbound call",
  direction: "outbound",
  occurredAt: new Date().toISOString(),
  ...over,
});

const NOW = Date.parse("2026-06-13T18:00:00Z");

describe("manualCallCooldownSec", () => {
  it("defaults to 45s and honors the env override (incl. 0 = disabled)", () => {
    expect(manualCallCooldownSec()).toBe(45);
    process.env.MANUAL_CALL_COOLDOWN_SEC = "10";
    expect(manualCallCooldownSec()).toBe(10);
    process.env.MANUAL_CALL_COOLDOWN_SEC = "0";
    expect(manualCallCooldownSec()).toBe(0);
    process.env.MANUAL_CALL_COOLDOWN_SEC = "-5"; // invalid → default
    expect(manualCallCooldownSec()).toBe(45);
  });
});

describe("calledTooRecently", () => {
  it("blocks when an outbound call landed inside the window", () => {
    const acts = [act({ occurredAt: new Date(NOW - 20_000).toISOString() })]; // 20s ago
    expect(calledTooRecently(acts, 45, NOW)).toBe(true);
  });

  it("allows once the window has passed", () => {
    const acts = [act({ occurredAt: new Date(NOW - 60_000).toISOString() })]; // 60s ago
    expect(calledTooRecently(acts, 45, NOW)).toBe(false);
  });

  it("ignores inbound calls and non-call activities", () => {
    const acts = [
      act({ direction: "inbound", occurredAt: new Date(NOW - 5_000).toISOString() }),
      act({ kind: "sms", occurredAt: new Date(NOW - 5_000).toISOString() }),
    ];
    expect(calledTooRecently(acts, 45, NOW)).toBe(false);
  });

  it("a cooldown of 0 disables the check entirely", () => {
    const acts = [act({ occurredAt: new Date(NOW - 1_000).toISOString() })];
    expect(calledTooRecently(acts, 0, NOW)).toBe(false);
  });

  it("no history → never blocks", () => {
    expect(calledTooRecently([], 45, NOW)).toBe(false);
  });
});
