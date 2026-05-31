import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchWithRetry, retryAfterMs, backoffMs } from "@/lib/crm/net";

afterEach(() => vi.unstubAllGlobals());

function res(status: number, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : "{}", { status, headers });
}

describe("retryAfterMs", () => {
  it("parses delta-seconds", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs("0")).toBe(0);
  });
  it("parses an HTTP date relative to now", () => {
    const now = 1_000_000;
    expect(retryAfterMs(new Date(now + 5000).toUTCString(), now)).toBeGreaterThanOrEqual(4000);
  });
  it("is undefined for missing/garbage", () => {
    expect(retryAfterMs(null)).toBeUndefined();
    expect(retryAfterMs("soon")).toBeUndefined();
  });
});

describe("backoffMs", () => {
  it("never exceeds the cap and grows with attempts", () => {
    for (let a = 0; a < 6; a++) expect(backoffMs(a, 400, 8000)).toBeLessThanOrEqual(8000);
  });
});

describe("fetchWithRetry", () => {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => { sleeps.push(ms); };

  it("retries 429 then succeeds, honoring Retry-After", async () => {
    sleeps.length = 0;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(429, { "retry-after": "1" }))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchWithRetry("https://x/y", undefined, { sleep });
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1000]); // waited exactly the server's Retry-After
  });

  it("retries transient 503s up to the limit then returns the last response", async () => {
    sleeps.length = 0;
    const fetchMock = vi.fn().mockResolvedValue(res(503));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchWithRetry("https://x/y", undefined, { sleep, retries: 2 });
    expect(r.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
    expect(sleeps.length).toBe(2);
  });

  it("does NOT retry a non-retryable 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchWithRetry("https://x/y", undefined, { sleep });
    expect(r.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries network errors then rethrows if they persist", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWithRetry("https://x/y", undefined, { sleep, retries: 1 })).rejects.toThrow("ECONNRESET");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recovers when a network error is followed by success", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("flaky"))
      .mockResolvedValueOnce(res(200));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchWithRetry("https://x/y", undefined, { sleep });
    expect(r.status).toBe(200);
  });

  it("passes an abort signal so a hung request can time out", async () => {
    // A fetch that hangs until its signal aborts — proves the timeout fires.
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWithRetry("https://x/y", undefined, { sleep, retries: 0, timeoutMs: 10 })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The signal was supplied to fetch.
    expect((fetchMock.mock.calls[0][1] as RequestInit | undefined)?.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not attach a signal when timeoutMs is 0 (disabled)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWithRetry("https://x/y", undefined, { sleep, timeoutMs: 0 });
    expect((fetchMock.mock.calls[0][1] as RequestInit | undefined)?.signal).toBeUndefined();
  });
});
