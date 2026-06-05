import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendAlert, isErrored } from "@/lib/alert";

const realFetch = global.fetch;
beforeEach(() => delete process.env.ALERT_WEBHOOK_URL);
afterEach(() => { global.fetch = realFetch; delete process.env.ALERT_WEBHOOK_URL; });

describe("sendAlert", () => {
  it("POSTs a compact alert when ALERT_WEBHOOK_URL is set", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    let body: Record<string, unknown> | null = null;
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    await sendAlert("cron.fanout_partial_failure", { failed: 2 });
    expect(body!.event).toBe("cron.fanout_partial_failure");
    expect((body!.detail as { failed: number }).failed).toBe(2);
  });

  it("is a no-op (no throw) when no webhook is configured", async () => {
    global.fetch = vi.fn(async () => { throw new Error("should not be called"); }) as unknown as typeof fetch;
    await expect(sendAlert("x", {})).resolves.toBeUndefined();
  });

  it("never throws even if the webhook POST fails", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.com/alert";
    global.fetch = vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    await expect(sendAlert("x", {})).resolves.toBeUndefined();
  });
});

describe("isErrored", () => {
  it("detects the cron stages' best-effort error shape", () => {
    expect(isErrored({ error: "boom" })).toBe(true);
    expect(isErrored({ sent: 3 })).toBe(false);
    expect(isErrored(null)).toBe(false);
    expect(isErrored("nope")).toBe(false);
  });
});
