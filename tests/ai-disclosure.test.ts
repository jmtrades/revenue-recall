import { describe, it, expect, afterEach } from "vitest";
import { aiDisclosure } from "@/lib/agent/guardrails";

afterEach(() => {
  delete process.env.CALL_AI_DISCLOSURE;
});

describe("aiDisclosure — AI callers identify themselves by default", () => {
  it("is ON with no configuration (the safe default)", () => {
    delete process.env.CALL_AI_DISCLOSURE;
    const d = aiDisclosure({ orgName: "Acme Roofing", repName: "Sam" });
    expect(d).toBe("Quick heads-up: I'm Sam's AI assistant at Acme Roofing.");
  });

  it("degrades gracefully without a rep or org name", () => {
    expect(aiDisclosure()).toBe("Quick heads-up: I'm an AI assistant.");
    expect(aiDisclosure({ orgName: "Acme" })).toBe("Quick heads-up: I'm an AI assistant at Acme.");
  });

  it("custom wording wins", () => {
    process.env.CALL_AI_DISCLOSURE = "Hi — this is Acme's automated assistant.";
    expect(aiDisclosure({ repName: "Sam" })).toBe("Hi — this is Acme's automated assistant.");
  });

  it("an explicit 'off' disables it (operator-verified jurisdictions only)", () => {
    process.env.CALL_AI_DISCLOSURE = "off";
    expect(aiDisclosure({ repName: "Sam" })).toBeNull();
  });
});
