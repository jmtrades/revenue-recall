/**
 * Bounded-concurrency async map. Runs `fn` over `items` with at most `limit`
 * promises in flight at once, preserving input order in the results.
 *
 * Why this exists: importing a "full blown list of leads" means thousands of
 * provider writes. Doing them strictly sequentially (await in a for-loop) is
 * slow enough to time out a serverless invocation; firing all of them at once
 * stampedes the database and trips rate limits. A small fixed window of workers
 * is the sweet spot — fast, but kind to the backend.
 *
 * Never rejects: each element resolves to `{ ok, value }` or `{ ok:false, error }`
 * so one bad row can't abort the whole import.
 */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function mapWithConcurrency<I, O>(
  items: readonly I[],
  limit: number,
  fn: (item: I, index: number) => Promise<O>,
): Promise<Settled<O>[]> {
  const results: Settled<O>[] = new Array(items.length);
  const width = Math.max(1, Math.min(limit, items.length));
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}
