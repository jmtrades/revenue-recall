// Test stub for next/headers (not available outside the Next server runtime).
export function cookies() {
  return {
    getAll: () => [] as { name: string; value: string }[],
    get: () => undefined,
    set: () => {},
  };
}
export function headers() {
  return new Map<string, string>();
}
