/**
 * SSRF guard for fetching USER-SUPPLIED URLs server-side (e.g. an org's custom
 * data-source URL). Blocks the classes a tenant could use to reach our own
 * infrastructure: non-http(s) schemes, loopback/private/link-local addresses,
 * and cloud metadata endpoints (169.254.169.254, metadata.google.internal).
 *
 * This is host/literal-based (it does not resolve DNS), so it's a pragmatic
 * defense, not a substitute for a network egress allowlist — but it stops the
 * metadata/loopback/private-range reachability that makes SSRF dangerous.
 */

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true; // malformed → reject
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local + AWS/GCP/Azure metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isBlockedHost(hostRaw: string): boolean {
  const host = hostRaw.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal" || host === "metadata") return true;
  if (isPrivateIpv4(host)) return true;
  // IPv6 loopback / unspecified / link-local / unique-local.
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host.startsWith("::ffff:")) return isPrivateIpv4(host.slice("::ffff:".length));
  return false;
}

/** Throws when `raw` is unsafe to fetch server-side; returns the parsed URL otherwise. */
export function assertSafeOutboundUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("invalid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("URL scheme not allowed (use http or https)");
  }
  if (isBlockedHost(u.hostname)) {
    throw new Error("URL host is not allowed (private/loopback/metadata address)");
  }
  return u;
}

/** Boolean form for callers that prefer a check over a throw. */
export function isSafeOutboundUrl(raw: string): boolean {
  try {
    assertSafeOutboundUrl(raw);
    return true;
  } catch {
    return false;
  }
}
