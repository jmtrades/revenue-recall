import { describe, it, expect } from "vitest";
import { goLiveStatus, type GoLiveSignals } from "@/lib/launch/go-live";

const ready: GoLiveSignals = {
  phoneConnected: true,
  gatewayReachable: true,
  gatewayMisdirected: false,
  gatewayCanPlace: true,
  voiceReady: true,
  brainReady: true,
  leadCount: 100,
  consentCount: 40,
  autopilotEntitled: true,
  sendingPaused: false,
  enabledAutoTasks: 1,
  lastRunAt: "2026-06-17T09:00:00Z",
  now: "2026-06-17T10:00:00Z",
};

const state = (s: ReturnType<typeof goLiveStatus>, key: string) => s.steps.find((x) => x.key === key)?.state;

describe("goLiveStatus", () => {
  it("is fully live when every gate is satisfied", () => {
    const s = goLiveStatus(ready);
    expect(s.liveForManualCalls).toBe(true);
    expect(s.liveForAutonomousCalls).toBe(true);
    expect(s.readyCount).toBe(s.total);
    expect(s.nextHref).toBeNull();
    expect(s.steps.every((x) => x.state === "live")).toBe(true);
  });

  it("no phone line → calls only log, not live, points to calling settings", () => {
    const s = goLiveStatus({ ...ready, phoneConnected: false });
    expect(state(s, "phone")).toBe("off");
    expect(s.liveForManualCalls).toBe(false);
    expect(s.liveForAutonomousCalls).toBe(false);
    expect(s.nextHref).toBe("/settings#calling");
    expect(s.steps.find((x) => x.key === "phone")?.detail).toMatch(/logged/i);
  });

  it("a misdirected or unreachable gateway is attention, not live", () => {
    expect(state(goLiveStatus({ ...ready, gatewayMisdirected: true }), "phone")).toBe("attention");
    expect(state(goLiveStatus({ ...ready, gatewayReachable: false }), "phone")).toBe("attention");
    // null gateway = direct Twilio, no health ping needed → still live
    expect(state(goLiveStatus({ ...ready, gatewayReachable: null }), "phone")).toBe("live");
  });

  it("a reachable gateway that can't place calls yet is attention, not 'dial out for real'", () => {
    // The gateway answers /health but its own phone trunk isn't wired — calls
    // can't actually be placed, so the Phone line step must NOT read as live.
    const s = goLiveStatus({ ...ready, gatewayCanPlace: false });
    expect(state(s, "phone")).toBe("attention");
    expect(s.liveForManualCalls).toBe(false);
    expect(s.liveForAutonomousCalls).toBe(false);
    expect(s.steps.find((x) => x.key === "phone")?.detail).toMatch(/can't place calls yet/i);
  });

  it("leads with zero consent is attention (can't auto-call); zero leads is off", () => {
    expect(state(goLiveStatus({ ...ready, consentCount: 0 }), "consent")).toBe("attention");
    const noLeads = goLiveStatus({ ...ready, leadCount: 0, consentCount: 0 });
    expect(state(noLeads, "consent")).toBe("off");
    expect(state(noLeads, "leads")).toBe("off");
  });

  it("paused sending blocks autonomous calls and flags attention", () => {
    const s = goLiveStatus({ ...ready, sendingPaused: true });
    expect(state(s, "sending")).toBe("attention");
    expect(s.liveForAutonomousCalls).toBe(false);
  });

  it("an enabled task that hasn't run recently flags the schedule (cron not firing)", () => {
    const stale = goLiveStatus({ ...ready, lastRunAt: "2026-06-10T00:00:00Z" }); // a week old
    expect(state(stale, "schedule")).toBe("attention");
    const never = goLiveStatus({ ...ready, lastRunAt: null });
    expect(state(never, "schedule")).toBe("attention");
  });

  it("no autopilot entitlement or no task keeps autonomous calling off", () => {
    expect(goLiveStatus({ ...ready, autopilotEntitled: false }).liveForAutonomousCalls).toBe(false);
    expect(goLiveStatus({ ...ready, enabledAutoTasks: 0 }).liveForAutonomousCalls).toBe(false);
    expect(state(goLiveStatus({ ...ready, enabledAutoTasks: 0 }), "schedule")).toBe("off");
  });
});
