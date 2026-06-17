import { describe, it, expect } from "vitest";
import { setupChecklist, type SetupSignals } from "@/lib/onboarding/checklist";

const none: SetupSignals = { hasLeads: false, voiceConfigured: false, hasCallConsent: false, hasRecallTouch: false };

describe("setupChecklist", () => {
  it("is all-incomplete with next = first step when nothing is set up", () => {
    const c = setupChecklist(none);
    expect(c.total).toBe(4);
    expect(c.doneCount).toBe(0);
    expect(c.complete).toBe(false);
    expect(c.nextHref).toBe("/leads"); // first incomplete step
    expect(c.steps.every((s) => !s.done)).toBe(true);
  });

  it("marks done steps and points next at the first incomplete one", () => {
    const c = setupChecklist({ ...none, hasLeads: true, voiceConfigured: true });
    expect(c.doneCount).toBe(2);
    expect(c.complete).toBe(false);
    expect(c.nextHref).toBe("/leads"); // hasCallConsent step's href is /leads
    expect(c.steps.find((s) => s.key === "hasLeads")?.done).toBe(true);
    expect(c.steps.find((s) => s.key === "hasRecallTouch")?.done).toBe(false);
  });

  it("is complete with no next step once every signal is present", () => {
    const c = setupChecklist({ hasLeads: true, voiceConfigured: true, hasCallConsent: true, hasRecallTouch: true });
    expect(c.complete).toBe(true);
    expect(c.doneCount).toBe(4);
    expect(c.nextHref).toBeNull();
  });
});
