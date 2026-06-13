/**
 * One place for client GET-and-parse, so components stop re-implementing
 * fetch + status checks + JSON parsing (each slightly differently). Safe by
 * construction: never throws on a non-OK status or unparseable body — it
 * returns a typed result the caller branches on — and forwards an AbortSignal
 * so callers can cancel on unmount / stale navigation. The React wrapper is
 * useResource(); this core is framework-free and unit-tested.
 */
export interface JsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** A human-readable error (network failure, non-OK status, bad JSON), or null. */
  error: string | null;
  /** True only when the request was aborted (caller should ignore the result). */
  aborted: boolean;
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: { signal?: AbortSignal; cache?: RequestCache; headers?: Record<string, string> } = {},
): Promise<JsonResult<T>> {
  try {
    const res = await fetch(url, { signal: opts.signal, cache: opts.cache ?? "no-store", headers: opts.headers });
    let data: T | null = null;
    try {
      data = (await res.json()) as T;
    } catch {
      data = null; // empty/non-JSON body — not fatal; status still tells the story
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : `Request failed (${res.status})`,
      aborted: false,
    };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return { ok: false, status: 0, data: null, error: aborted ? null : "Network error", aborted };
  }
}
