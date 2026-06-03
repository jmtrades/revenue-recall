import { describe, it, expect, vi, afterEach } from "vitest";
import { healthUrlFrom, gatewayDiagnostics } from "@/lib/calls/diagnostics";

describe("healthUrlFrom", () => {
  it("turns a .../voice webhook into the gateway's /health", () => {
    expect(healthUrlFrom("https://gw.onrender.com/voice")).toBe("https://gw.onrender.com/health");
    expect(healthUrlFrom("https://gw.onrender.com/voice/")).toBe("https://gw.onrender.com/health");
  });
  it("handles a bare host with no /voice path", () => {
    expect(healthUrlFrom("https://gw.onrender.com")).toBe("https://gw.onrender.com/health");
  });
  it("drops query and hash", () => {
    expect(healthUrlFrom("https://gw.onrender.com/voice?x=1#y")).toBe("https://gw.onrender.com/health");
  });
});

describe("gatewayDiagnostics", () => {
  const origUrl = process.env.VOICE_WEBHOOK_URL;
  afterEach(() => {
    process.env.VOICE_WEBHOOK_URL = origUrl;
    vi.unstubAllGlobals();
  });

  it("reports not-configured when VOICE_WEBHOOK_URL is unset", async () => {
    delete process.env.VOICE_WEBHOOK_URL;
    const d = await gatewayDiagnostics();
    expect(d.voiceConfigured).toBe(false);
    expect(d.gateway).toBeNull();
  });

  it("reads a healthy gateway response", async () => {
    process.env.VOICE_WEBHOOK_URL = "https://gw.onrender.com/voice";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "ok", voice: true, brain: true, twilio: true, transport: "twilio" }), { status: 200 })));
    const d = await gatewayDiagnostics();
    expect(d.gatewayUrl).toBe("https://gw.onrender.com/health");
    expect(d.gateway).toMatchObject({ reachable: true, voice: true, brain: true, twilio: true, transport: "twilio" });
  });

  it("flags a URL that points at the app instead of the gateway", async () => {
    process.env.VOICE_WEBHOOK_URL = "https://www.recall-touch.com/voice";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "ok", capabilities: { voice: true }, launch: { ready: true } }), { status: 200 })));
    const d = await gatewayDiagnostics();
    expect(d.gateway?.misdirected).toBe(true);
  });

  it("marks the gateway unreachable on a network error", async () => {
    process.env.VOICE_WEBHOOK_URL = "https://gw.onrender.com/voice";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const d = await gatewayDiagnostics();
    expect(d.gateway?.reachable).toBe(false);
    expect(d.gateway?.detail).toContain("ECONNREFUSED");
  });
});
