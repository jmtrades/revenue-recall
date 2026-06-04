import { describe, it, expect } from "vitest";
import { planCallRetry, isRetryableOutcome, windowForHour, MAX_CALL_ATTEMPTS } from "@/lib/calls/retry";

describe("call retry: outcome classification", () => {
  it("retries only when no human was reached", () => {
    for (const o of ["no_answer", "no-answer", "voicemail", "VM left", "busy", "machine", "unavailable"]) {
      expect(isRetryableOutcome(o), o).toBe(true);
    }
    for (const o of ["connected", "meeting_booked", "callback_scheduled", "not_interested", "booked", undefined]) {
      expect(isRetryableOutcome(o), String(o)).toBe(false);
    }
  });

  it("maps hours to day-part windows", () => {
    expect(windowForHour(9)).toBe("morning");
    expect(windowForHour(12)).toBe("midday");
    expect(windowForHour(16)).toBe("afternoon");
    expect(windowForHour(19)).toBe("evening");
  });
});

describe("call retry: planning", () => {
  it("schedules attempt #2 in a DIFFERENT window after a morning no-answer", () => {
    const plan = planCallRetry({ outcome: "no_answer", priorAttempts: 1, lastHour: 9 });
    expect(plan.retry).toBe(true);
    expect(plan.attempt).toBe(2);
    expect(plan.window).not.toBe("morning"); // rotate off the dead slot
    expect(plan.waitHours).toBeGreaterThan(0);
  });

  it("does not retry a reached decision", () => {
    expect(planCallRetry({ outcome: "meeting_booked", priorAttempts: 1 }).retry).toBe(false);
    expect(planCallRetry({ outcome: "not_interested", priorAttempts: 1 }).retry).toBe(false);
  });

  it("stops at the attempt cap", () => {
    expect(planCallRetry({ outcome: "no_answer", priorAttempts: MAX_CALL_ATTEMPTS }).retry).toBe(false);
    expect(planCallRetry({ outcome: "no_answer", priorAttempts: MAX_CALL_ATTEMPTS - 1 }).retry).toBe(true);
  });

  it("never re-dials the SAME window — including the final retry (made=3)", () => {
    const lastHour = 15; // afternoon
    for (let made = 0; made < MAX_CALL_ATTEMPTS; made++) {
      const plan = planCallRetry({ outcome: "no_answer", priorAttempts: made, lastHour });
      if (plan.retry) expect(plan.window, `made=${made}`).not.toBe(windowForHour(lastHour));
    }
  });

  it("spreads later attempts across the day and backs off", () => {
    const a2 = planCallRetry({ outcome: "voicemail", priorAttempts: 1, lastHour: 9 });
    const a3 = planCallRetry({ outcome: "voicemail", priorAttempts: 2, lastHour: 9 });
    expect(a3.window).not.toBe(a2.window); // different window than the previous retry
    expect(a3.waitHours).toBeGreaterThanOrEqual(a2.waitHours); // growing backoff
  });
});
