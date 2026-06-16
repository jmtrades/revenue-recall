import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { elevenClient, elevenSdkError, streamToArrayBuffer } from "@/lib/voice/eleven-client";

const ORIGINAL = process.env.ELEVENLABS_API_KEY;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = ORIGINAL;
});

describe("elevenClient", () => {
  beforeEach(() => delete process.env.ELEVENLABS_API_KEY);

  it("is null when no key is configured (feature self-gates)", () => {
    expect(elevenClient()).toBeNull();
  });

  it("returns a client once a key is set, and memoizes it per key", () => {
    process.env.ELEVENLABS_API_KEY = "el-a";
    const a = elevenClient();
    expect(a).not.toBeNull();
    expect(elevenClient()).toBe(a); // same key → same instance
    process.env.ELEVENLABS_API_KEY = "el-b";
    expect(elevenClient()).not.toBe(a); // key changed → rebuilt
  });
});

describe("elevenSdkError", () => {
  it("surfaces an SDK error's status and body (the provider's real reason)", () => {
    const e = new ElevenLabsError({ message: "bad", statusCode: 401, body: { detail: "invalid_api_key" } });
    const msg = elevenSdkError("ElevenLabs", e);
    expect(msg).toContain("ElevenLabs 401");
    expect(msg).toContain("invalid_api_key");
  });

  it("falls back to the message when there's no status/body", () => {
    expect(elevenSdkError("ElevenLabs token", new Error("boom"))).toBe("ElevenLabs token: boom");
  });

  it("truncates a long body so the message stays readable", () => {
    const e = new ElevenLabsError({ statusCode: 500, body: "x".repeat(500) });
    expect(elevenSdkError("ElevenLabs", e).length).toBeLessThan(240);
  });
});

describe("streamToArrayBuffer", () => {
  it("concatenates every chunk into one buffer, in order", async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6])];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    });
    const buf = await streamToArrayBuffer(stream);
    expect(Array.from(new Uint8Array(buf))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns an empty buffer for an empty stream", async () => {
    const stream = new ReadableStream<Uint8Array>({ start: (c) => c.close() });
    expect((await streamToArrayBuffer(stream)).byteLength).toBe(0);
  });
});
