import { describe, it, expect, afterEach } from "vitest";
import { getSynth, setSynth, browserSynth, type VoiceSynth } from "@/lib/voice/synth";

afterEach(() => setSynth(null));

describe("voice synth seam (ElevenLabs-only)", () => {
  it("returns the no-op synth when nothing is registered — there is no browser fallback", () => {
    const s = getSynth();
    expect(s.id).toBe("none");
    expect(s.available()).toBe(false); // ElevenLabs-only: no fallback voice
    expect(browserSynth.available()).toBe(false); // the old browser backend is now a no-op
  });

  it("prefers the registered ElevenLabs backend when it reports available", () => {
    const eleven: VoiceSynth = { id: "rr-hosted-tts", kind: "neural", available: () => true, speak: async () => ({ done: Promise.resolve(), stop: () => {} }) };
    setSynth(eleven);
    expect(getSynth().id).toBe("rr-hosted-tts");
  });

  it("falls back to the silent no-op (NOT browser TTS) when the registered backend is unavailable", () => {
    const eleven: VoiceSynth = { id: "rr-hosted-tts", kind: "neural", available: () => false, speak: async () => ({ done: Promise.resolve(), stop: () => {} }) };
    setSynth(eleven);
    expect(getSynth().id).toBe("none");
  });
});
