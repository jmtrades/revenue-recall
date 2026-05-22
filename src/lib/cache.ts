import * as React from "react";

/**
 * React's per-request `cache()` (available via Next's bundled React). Falls back
 * to an identity wrapper in environments that don't provide it (e.g. unit tests),
 * so request-deduped helpers can be imported anywhere.
 */
type AnyFn = (...args: never[]) => unknown;
const reactCache = (React as unknown as { cache?: <T extends AnyFn>(fn: T) => T }).cache;
export const cache = reactCache ?? (<T extends AnyFn>(fn: T): T => fn);
