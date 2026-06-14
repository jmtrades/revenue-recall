/**
 * Per-request correlation id. Prefer an id the upstream edge already assigned
 * (Vercel sets `x-vercel-id`; a proxy/LB may set `x-request-id`) so a single
 * request lines up across every hop's logs; otherwise mint one. withGuard puts
 * this on the error it logs/alerts AND on the response (body + `x-request-id`
 * header), so a 500 a user reports can be found in the logs by one id.
 */
export function requestId(req: Request): string {
  const h = req.headers;
  return h.get("x-request-id") || h.get("x-vercel-id") || cryptoRandomId();
}

function cryptoRandomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Extremely old runtimes / non-crypto contexts — good enough for correlation.
    return `rid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}
