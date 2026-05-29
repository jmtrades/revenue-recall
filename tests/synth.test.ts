import { describe, it, expect, afterEach } from "vitest";
import { getSynth, setSynth, browserSynth, type VoiceSynth } from "@/lib/voice/synth";

afterEach(() => setSynth(null));

describe("voice synth seam", () => {
  it("defaults to the browser backend (unavailable in node, but resolvable)", () => {
    const s = getSynth();
    expect(s.id).toBe("browser");
    expect(s.kind).toBe("client");
    expect(browserSynth.available()).toBe(false); // no DOM in tests
  });

  it("prefers a registered backend when it reports available", () => {
    const neural: VoiceSynth = { id: "rr-neural-v1", kind: "neural", available: () => true, speak: async () => ({ done: Promise.resolve(), stop: () => {} }) };
    setSynth(neural);
    expect(getSynth().id).toBe("rr-neural-v1");
  });

  it("falls back to browser when the registered backend is unavailable", () => {
    const neural: VoiceSynth = { id: "rr-neural-v1", kind: "neural", available: () => false, speak: async () => ({ done: Promise.resolve(), stop: () => {} }) };
    setSynth(neural);
    expect(getSynth().id).toBe("browser");
  });
});
