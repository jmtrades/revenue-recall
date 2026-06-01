import { describe, it, expect, vi, afterEach } from "vitest";
import { logInfo, errMessage } from "@/lib/log";

afterEach(() => vi.restoreAllMocks());

describe("structured logger", () => {
  it("emits one JSON line with event + fields and redacts secret-shaped keys", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logInfo("test.event", { ok: 1, authorization: "Bearer abc", apiKey: "sk-x", token: "t" });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.event).toBe("test.event");
    expect(parsed.level).toBe("info");
    expect(parsed.ok).toBe(1);
    expect(parsed.authorization).toBe("[redacted]");
    expect(parsed.apiKey).toBe("[redacted]");
    expect(parsed.token).toBe("[redacted]");
    expect(typeof parsed.ts).toBe("string");
  });
});

describe("errMessage", () => {
  it("extracts a message from an Error and stringifies anything else", () => {
    expect(errMessage(new Error("boom"))).toBe("boom");
    expect(errMessage("plain")).toBe("plain");
    expect(errMessage(42)).toBe("42");
  });
});
