"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  /** Human-readable error, or null. Status-based handling goes through onStatus. */
  error: string | null;
  /** Re-run the fetch (e.g. after a mutation). */
  reload: () => void;
}

/**
 * Fetch JSON for a client component, the right way: aborts on unmount and when
 * `url` changes, and ignores any response that resolves after a newer request
 * started — so fast navigation can't render deal A's data under deal B (the
 * race the ad-hoc useEffect+fetch(no-abort) pattern had across the app).
 *
 * `select` maps the raw JSON to your shape. `onStatus` lets a caller handle a
 * specific status (e.g. return true on 403 to render nothing) — return true to
 * mark it handled (no error surfaced). Pass `url: null` to skip fetching.
 */
export function useResource<T>(
  url: string | null,
  select: (json: unknown) => T,
  opts?: { onStatus?: (status: number) => boolean; cache?: RequestCache },
): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Keep the latest select/onStatus without making them effect dependencies
  // (callers pass inline functions; we don't want to refetch on every render).
  const selectRef = useRef(select);
  selectRef.current = select;
  const onStatusRef = useRef(opts?.onStatus);
  onStatusRef.current = opts?.onStatus;
  const cache = opts?.cache;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (url === null) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchJson<unknown>(url, { signal: ctrl.signal, cache }).then((res) => {
      if (res.aborted) return; // superseded / unmounted — never touch state
      if (onStatusRef.current?.(res.status)) {
        setLoading(false);
        return; // caller handled this status (e.g. 403 → render nothing)
      }
      if (!res.ok) {
        setError(res.error ?? "Request failed");
        setLoading(false);
        return;
      }
      try {
        setData(selectRef.current(res.data));
      } catch {
        setError("Couldn't read the response.");
      }
      setLoading(false);
    });
    return () => ctrl.abort();
  }, [url, nonce, cache]);

  return { data, loading, error, reload };
}
