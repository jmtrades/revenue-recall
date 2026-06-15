import { describe, it, expect, afterEach } from "vitest";
import { convaiReason, convaiConfigured, convaiAgentId } from "@/lib/voice/convai";

afterEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_AGENT_ID;
});

describe("convaiReason — live agent diagnostic", () => {
  it("reports the first unmet requirement in fix order", () => {
    expect(convaiReason(false, false, false)).toBe("no_key");
    expect(convaiReason(false, true, true)).toBe("no_key"); // key missing wins
    expect(convaiReason(true, false, true)).toBe("no_agent"); // key set, no agent
    expect(convaiReason(true, true, false)).toBe("not_entitled"); // configured, free plan
    expect(convaiReason(true, true, true)).toBe("ok");
  });
});

describe("convaiConfigured — needs BOTH key and agent id", () => {
  it("is false unless the key and agent id are both set", () => {
    expect(convaiConfigured()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "el-x";
    expect(convaiConfigured()).toBe(false); // key alone isn't enough
    process.env.ELEVENLABS_AGENT_ID = "agent_123";
    expect(convaiConfigured()).toBe(true);
    expect(convaiAgentId()).toBe("agent_123");
  });
});
