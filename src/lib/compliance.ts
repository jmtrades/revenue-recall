/**
 * Outbound compliance — the non-negotiable bit before sending real outreach to
 * real people. CAN-SPAM requires commercial email to carry an opt-out mechanism
 * and a physical postal address; SMS (TCPA/CTIA) requires opt-out instructions.
 *
 * These helpers append the required language at the send boundary (see comms.ts),
 * so every outbound path — Autopilot, cadences, inbound replies, manual sends —
 * is covered. Idempotent (won't double-append) and configurable; on by default.
 */

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export interface ComplianceConfig {
  enabled: boolean;
  orgName?: string;
  /** Physical postal address (CAN-SPAM requirement for commercial email). */
  address?: string;
}

/** Per-org overrides win over env (multi-tenant: each org sets its own identity). */
export function complianceConfig(override?: { orgName?: string; address?: string }): ComplianceConfig {
  return {
    enabled: env("OUTBOUND_COMPLIANCE") !== "false",
    orgName: override?.orgName || env("OUTBOUND_ORG_NAME") || env("NEXT_PUBLIC_ORG_NAME"),
    address: override?.address || env("COMPLIANCE_ADDRESS"),
  };
}

/**
 * Operator attestations — the platform-level deliverability/carrier prerequisites
 * we can't verify from inside the app (DKIM/DMARC validity, A2P 10DLC brand +
 * campaign approval). The operator asserts they're done by setting the env flag;
 * until then autonomous outreach on that channel is held for review rather than
 * blasted from an unauthenticated domain / unregistered A2P number. A truthy flag
 * ("true"/"1"/"yes") attests; anything else (incl. unset) is "not yet."
 */
function attests(name: string): boolean {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
/** SPF/DKIM/DMARC verified for the sending domain (operator attestation). */
export function emailDomainVerified(): boolean {
  return attests("EMAIL_DOMAIN_VERIFIED");
}
/** A2P 10DLC brand + campaign registered for the SMS sender (operator attestation). */
export function smsA2pRegistered(): boolean {
  return attests("SMS_A2P_REGISTERED");
}

/** Append a CAN-SPAM footer (org name, postal address, unsubscribe) to an email body.
 *  Pass a per-contact unsubscribeUrl for one-click opt-out, else it falls back to reply-based. */
export function appendEmailCompliance(body: string, unsubscribeUrl?: string | null, cfg: ComplianceConfig = complianceConfig()): string {
  if (!cfg.enabled) return body;
  if (/\bunsubscribe\b|\bopt[\s-]?out\b/i.test(body)) return body; // already compliant
  const lines = ["—"];
  if (cfg.orgName) lines.push(cfg.orgName);
  if (cfg.address) lines.push(cfg.address);
  lines.push(unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : 'Reply "unsubscribe" and I\'ll take you off my list.');
  return `${body}\n\n${lines.join("\n")}`;
}

/** Append SMS opt-out instructions ("Reply STOP to opt out") unless already present. */
export function appendSmsCompliance(body: string, cfg: ComplianceConfig = complianceConfig()): string {
  if (!cfg.enabled) return body;
  if (/\bstop\b/i.test(body)) return body; // already mentions opt-out
  return `${body} Reply STOP to opt out.`;
}
