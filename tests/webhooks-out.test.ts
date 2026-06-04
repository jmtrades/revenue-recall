import { describe, it, expect, vi, afterEach } from "vitest";
import { signWebhook, isValidWebhookUrl, postWebhook, encodeWebhookSecret, decodeWebhookSecret } from "@/lib/webhooks-out";
import { isEncrypted } from "@/lib/crypto";

afterEach(() => vi.restoreAllMocks());

describe("webhook secret at rest", () => {
  it("stores plaintext when no ENCRYPTION_KEY, encrypted when present — round-trips both", () => {
    const original = process.env.ENCRYPTION_KEY;

    delete process.env.ENCRYPTION_KEY;
    expect(encodeWebhookSecret("whsec_abc")).toBe("whsec_abc"); // graceful fallback
    expect(decodeWebhookSecret("whsec_abc")).toBe("whsec_abc");

    process.env.ENCRYPTION_KEY = "an-encryption-key-at-least-16-chars";
    const enc = encodeWebhookSecret("whsec_abc");
    expect(enc).not.toBe("whsec_abc");
    expect(isEncrypted(enc)).toBe(true); // a DB dump can't read it
    expect(decodeWebhookSecret(enc)).toBe("whsec_abc"); // signer still recovers it

    if (original === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = original;
  });
});

describe("webhook signing", () => {
  it("signs deterministically and differs by body or secret", () => {
    const a = signWebhook("s1", "body");
    expect(a).toBe(signWebhook("s1", "body"));
    expect(a).not.toBe(signWebhook("s1", "other"));
    expect(a).not.toBe(signWebhook("s2", "body"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isValidWebhookUrl", () => {
  it("accepts public https and rejects http / internal hosts", () => {
    expect(isValidWebhookUrl("https://hooks.example.com/x")).toBe(true);
    expect(isValidWebhookUrl("http://hooks.example.com/x")).toBe(false); // https only
    expect(isValidWebhookUrl("https://127.0.0.1/x")).toBe(false);
    expect(isValidWebhookUrl("https://localhost/x")).toBe(false);
    expect(isValidWebhookUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isValidWebhookUrl("not-a-url")).toBe(false);
  });
});

describe("postWebhook", () => {
  it("POSTs a signed payload to a public URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await postWebhook("https://hooks.example.com/x", "whsec_test", "lead.created", { id: "d_1" });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-rr-event"]).toBe("lead.created");
    // The signature header must match HMAC over the exact body we sent.
    expect(headers["x-rr-signature"]).toBe(`sha256=${signWebhook("whsec_test", init.body as string)}`);
  });

  it("refuses to deliver to a blocked (internal) host and never calls fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await postWebhook("http://127.0.0.1/x", "whsec_test", "lead.created", {});
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok:false (never throws) when delivery fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const res = await postWebhook("https://hooks.example.com/x", "whsec_test", "lead.created", {});
    expect(res.ok).toBe(false);
  });
});
