import { afterEach, describe, expect, it } from "vitest";
import { neuralSynth, enableNeuralVoice } from "@/lib/voice/neural";
import { getSynth, setSynth, browserSynth } from "@/lib/voice/synth";

const ORIGINAL = process.env.NEXT_PUBLIC_NEURAL_VOICE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_NEURAL_VOICE_URL;
  else process.env.NEXT_PUBLIC_NEURAL_VOICE_URL = ORIGINAL;
  setSynth(null); // reset the registered backend between tests
});

describe("neural voice backend", () => {
  it("declares the VoiceSynth contract", () => {
    expect(neuralSynth.id).toBe("rr-neural-v1");
    expect(neuralSynth.kind).toBe("neural");
    expect(typeof neuralSynth.available).toBe("function");
    expect(typeof neuralSynth.speak).toBe("function");
  });

  it("is unavailable when no service URL is configured", () => {
    delete process.env.NEXT_PUBLIC_NEURAL_VOICE_URL;
    expect(neuralSynth.available()).toBe(false);
  });

  it("is unavailable in a non-browser (SSR/test) environment even with a URL", () => {
    // No `window`/`WebSocket` in the node test env, so it must report unavailable
    // rather than crash — proving the SSR guard holds.
    process.env.NEXT_PUBLIC_NEURAL_VOICE_URL = "wss://voice.example/stream";
    expect(neuralSynth.available()).toBe(false);
  });

  it("enableNeuralVoice() registers it but getSynth() still falls back to browser when unavailable", () => {
    delete process.env.NEXT_PUBLIC_NEURAL_VOICE_URL;
    enableNeuralVoice();
    // Registered, but unavailable → getSynth must return the always-on browser engine.
    expect(getSynth().id).toBe(browserSynth.id);
  });

  it("speak() degrades to a no-op handle when unavailable (never throws)", async () => {
    delete process.env.NEXT_PUBLIC_NEURAL_VOICE_URL;
    const handle = await neuralSynth.speak("hello there", {});
    expect(handle).toHaveProperty("done");
    expect(handle).toHaveProperty("stop");
    expect(() => handle.stop()).not.toThrow();
    await expect(handle.done).resolves.toBeUndefined();
  });
});
