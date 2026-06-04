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

/** True when a 32-bit IPv4 value is in a private/loopback/link-local/CGNAT range. */
function isPrivateIpv4Int(v: number): boolean {
  const a = (v >>> 24) & 0xff;
  const b = (v >>> 16) & 0xff;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * Parse a host as an IPv4 literal in ANY legacy encoding the URL/fetch stack
 * accepts — dotted-quad, decimal (2130706433), hex (0x7f000001), octal
 * (0177.0.0.1), and short forms (127.1) — returning the 32-bit value, or null if
 * it isn't an all-numeric IPv4 literal (i.e. it's a real DNS name). Without this,
 * encoded loopback/metadata addresses slip past a plain dotted-quad regex.
 */
function ipv4ToInt(host: string): number | null {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (p === "") return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) n = parseInt(p.slice(2), 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^[0-9]+$/.test(p)) n = parseInt(p, 10);
    else return null; // a non-numeric label → this is a DNS name, not an IP literal
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }
  // WHATWG combination: the last part fills the remaining low bytes.
  let value: number;
  if (nums.length === 1) {
    value = nums[0];
  } else {
    for (let i = 0; i < nums.length - 1; i++) if (nums[i] > 255) return null;
    const last = nums[nums.length - 1];
    if (last >= 2 ** (8 * (4 - (nums.length - 1)))) return null;
    value = last;
    for (let i = 0; i < nums.length - 1; i++) value += nums[i] * 2 ** (8 * (3 - i));
  }
  if (value < 0 || value > 0xffffffff) return null;
  return value >>> 0;
}

function isBlockedHost(hostRaw: string): boolean {
  const host = hostRaw.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal" || host === "metadata") return true;
  // IPv4 in any encoding → range-check the canonical value.
  const v4 = ipv4ToInt(host);
  if (v4 !== null) return isPrivateIpv4Int(v4);
  // IPv6 loopback / unspecified / link-local / unique-local.
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host.startsWith("::ffff:")) {
    // IPv4-mapped IPv6, dotted ("127.0.0.1") or hex-group ("7f00:1", which is how
    // the URL parser canonicalizes it).
    const rest = host.slice("::ffff:".length);
    let v: number | null = null;
    if (rest.includes(".")) {
      v = ipv4ToInt(rest);
    } else {
      const g = rest.split(":");
      if (g.length === 2 && g.every((x) => /^[0-9a-f]{1,4}$/.test(x))) v = ((parseInt(g[0], 16) << 16) | parseInt(g[1], 16)) >>> 0;
    }
    return v !== null && isPrivateIpv4Int(v);
  }
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
