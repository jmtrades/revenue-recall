import { promises as dns } from "node:dns";

/**
 * Email deliverability: domain authentication (SPF / DKIM / DMARC). Suppression
 * (bounce.ts) and the CAN-SPAM footer (compliance.ts) keep us from torching
 * reputation; THIS is the front half — telling the operator exactly which DNS
 * records to add so mail is authenticated and lands in the inbox, and verifying
 * (live DNS) whether they're in place.
 *
 * The record GUIDANCE is pure (testable, no I/O); the live check does best-effort
 * DNS lookups and never throws — a lookup failure reads as "couldn't verify".
 */

/** The sending address from EMAIL_FROM, which may be "Name <a@b.com>" or "a@b.com". */
export function sendingAddress(): string | null {
  const raw = (process.env.EMAIL_FROM ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  const email = (m ? m[1] : raw).trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

/** The sending domain (the part after @), or null when EMAIL_FROM isn't set. */
export function sendingDomain(): string | null {
  const addr = sendingAddress();
  return addr ? addr.split("@")[1].toLowerCase() : null;
}

export type DnsKind = "TXT" | "CNAME";
export interface DnsRecord {
  label: "SPF" | "DKIM" | "DMARC";
  kind: DnsKind;
  /** DNS host/name to create (relative to the domain). */
  host: string;
  /** The value to set, or guidance when it's provider-account-specific. */
  value: string;
  note?: string;
}

const SPF_INCLUDE: Record<string, string> = {
  resend: "include:amazonses.com",
  sendgrid: "include:sendgrid.net",
};

/**
 * The DNS records an operator should add for `domain` given the email provider.
 * SPF + DMARC are concrete; DKIM is account-specific (the provider's dashboard
 * issues the exact selector records), so we point there rather than guess.
 */
export function expectedRecords(domain: string, provider: string): DnsRecord[] {
  const include = SPF_INCLUDE[provider];
  const spfValue = include ? `v=spf1 ${include} ~all` : "v=spf1 ~all";
  return [
    {
      label: "SPF",
      kind: "TXT",
      host: "@",
      value: spfValue,
      note: include ? `Authorizes ${provider} to send for ${domain}. If you already have a v=spf1 record, merge the include into it (don't add a second SPF record).` : `Add your provider's SPF include between "v=spf1" and "~all".`,
    },
    {
      label: "DKIM",
      kind: "CNAME",
      host: "(from your provider)",
      value: `Add the DKIM CNAME records ${provider !== "log" ? `${provider} ` : ""}shows in its dashboard for ${domain}.`,
      note: "DKIM selectors are account-specific, so they're issued by your email provider — add them exactly as shown there.",
    },
    {
      label: "DMARC",
      kind: "TXT",
      host: "_dmarc",
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
      note: "Start at p=none to monitor, then tighten to quarantine/reject once SPF + DKIM pass.",
    },
  ];
}

export interface AuthCheck {
  ok: boolean;
  record?: string;
}
export interface DomainAuthStatus {
  domain: string;
  spf: AuthCheck;
  dmarc: AuthCheck;
  /** True when DNS couldn't be queried at all (network/resolver failure). */
  unavailable?: boolean;
}

/** Look up the TXT records for a name, flattening multi-string records. Never
 *  throws — a miss / failure returns []. */
async function txt(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

/** Live-verify SPF + DMARC for a domain via DNS. Best-effort; DKIM is left to the
 *  provider dashboard (its selector isn't knowable here). */
export async function checkDomainAuth(domain: string): Promise<DomainAuthStatus> {
  const [root, dmarc] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`)]);
  const spfRecord = root.find((r) => /v=spf1/i.test(r));
  const dmarcRecord = dmarc.find((r) => /v=DMARC1/i.test(r));
  return {
    domain,
    spf: { ok: Boolean(spfRecord), record: spfRecord },
    dmarc: { ok: Boolean(dmarcRecord), record: dmarcRecord },
    // If even the root TXT lookup returned nothing, DNS likely couldn't be
    // reached — flag it so the UI says "couldn't check" rather than "missing".
    unavailable: root.length === 0 && dmarc.length === 0,
  };
}
