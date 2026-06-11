import { describe, it, expect } from "vitest";
import { clampPlan, templateSequence, generateSequence } from "@/lib/ai/sequence";
import { getIndustry } from "@/lib/industries";

describe("clampPlan — model output is coerced into something runnable", () => {
  it("rejects plans with fewer than 3 usable steps", () => {
    expect(clampPlan({ steps: [{ day: 0, channel: "email", body: "x" }] }, "n", "g")).toBeNull();
    expect(clampPlan({ steps: "nope" }, "n", "g")).toBeNull();
  });

  it("clamps days into 0–60, keeps them strictly increasing, and fixes channels", () => {
    const plan = clampPlan(
      {
        name: "Test",
        steps: [
          { day: -5, channel: "email", body: "a", subject: "s" },
          { day: 0, channel: "carrier-pigeon", body: "b" },
          { day: 999, channel: "sms", body: "c" },
          { day: 2, channel: "call", body: "d" },
        ],
      },
      "fallback",
      "the goal",
    );
    expect(plan).not.toBeNull();
    const days = plan!.steps.map((s) => s.day);
    expect(days[0]).toBe(0);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
    expect(days.every((d) => d >= 0 && d <= 60)).toBe(true);
    expect(plan!.steps[1].channel).toBe("email"); // unknown channel coerced
    expect(plan!.steps[1].subject).toBe("Follow-up"); // titled even without a model subject
  });

  it("relabels non-email subjects, keeps email ones, drops empty-body steps", () => {
    const plan = clampPlan(
      {
        steps: [
          { day: 0, channel: "sms", body: "a", subject: "an email-style subject" },
          { day: 1, channel: "email", body: "   " },
          { day: 2, channel: "call", body: "b" },
          { day: 3, channel: "email", body: "c", subject: "stays" },
        ],
      },
      "n",
      "g",
    );
    expect(plan!.steps).toHaveLength(3);
    expect(plan!.steps[0].subject).toBe("Text nudge"); // not the email-style subject
    expect(plan!.steps[1].subject).toBe("Call attempt");
    expect(plan!.steps[2].subject).toBe("stays");
  });
});

describe("templateSequence — the no-AI fallback is still personal", () => {
  const ind = getIndustry("real_estate");

  it("grounds steps in the industry playbook and the stated goal", () => {
    const goal = "win back stale buyer leads";
    const plan = templateSequence(goal, ind, "boutique brokerage in Austin");
    const joined = plan.steps.map((s) => s.body).join(" ");
    expect(plan.goal).toBe(goal);
    expect(joined).toContain(goal); // the goal shapes the copy
    expect(joined).toContain(ind.playbook.objections[0]); // real industry objection
    expect(joined).toContain("boutique brokerage in Austin"); // their business
  });

  it("mixes channels with an ascending timeline starting day 0", () => {
    const plan = templateSequence("any goal", ind);
    const channels = new Set(plan.steps.map((s) => s.channel));
    expect(channels.has("email") && channels.has("sms") && channels.has("call")).toBe(true);
    expect(plan.steps[0].day).toBe(0);
    for (let i = 1; i < plan.steps.length; i++) expect(plan.steps[i].day).toBeGreaterThan(plan.steps[i - 1].day);
  });
});

describe("generateSequence — end to end without an AI key", () => {
  it("returns a runnable, tailored plan (template path)", async () => {
    const plan = await generateSequence("re-engage lost deals");
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    expect(plan.name.length).toBeGreaterThan(0);
    expect(plan.steps.every((s) => s.body.length > 0)).toBe(true);
  });
});
