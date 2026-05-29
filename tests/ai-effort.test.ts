import { describe, it, expect, afterEach } from "vitest";
import { aiEffort, aiModel } from "@/lib/ai/client";

const savedEffort = process.env.ANTHROPIC_EFFORT;
const savedModel = process.env.ANTHROPIC_MODEL;
afterEach(() => {
  if (savedEffort === undefined) delete process.env.ANTHROPIC_EFFORT;
  else process.env.ANTHROPIC_EFFORT = savedEffort;
  if (savedModel === undefined) delete process.env.ANTHROPIC_MODEL;
  else process.env.ANTHROPIC_MODEL = savedModel;
});

describe("aiModel", () => {
  it("defaults to the current Opus and honors an override", () => {
    delete process.env.ANTHROPIC_MODEL;
    expect(aiModel()).toBe("claude-opus-4-8");
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5";
    expect(aiModel()).toBe("claude-haiku-4-5");
  });
});

describe("aiEffort", () => {
  it("is undefined when unset", () => {
    delete process.env.ANTHROPIC_EFFORT;
    expect(aiEffort()).toBeUndefined();
  });
  it("accepts the valid effort levels", () => {
    for (const e of ["low", "medium", "high", "xhigh", "max"]) {
      process.env.ANTHROPIC_EFFORT = e;
      expect(aiEffort()).toBe(e);
    }
  });
  it("rejects garbage (so a typo can't smuggle a bad param into the request)", () => {
    process.env.ANTHROPIC_EFFORT = "ultra";
    expect(aiEffort()).toBeUndefined();
    process.env.ANTHROPIC_EFFORT = "";
    expect(aiEffort()).toBeUndefined();
  });
});
