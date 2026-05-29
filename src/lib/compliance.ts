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

export function complianceConfig(): ComplianceConfig {
  return {
    enabled: env("OUTBOUND_COMPLIANCE") !== "false",
    orgName: env("OUTBOUND_ORG_NAME") ?? env("NEXT_PUBLIC_ORG_NAME"),
    address: env("COMPLIANCE_ADDRESS"),
  };
}

/** Append a CAN-SPAM footer (org name, postal address, unsubscribe) to an email body. */
export function appendEmailCompliance(body: string, cfg: ComplianceConfig = complianceConfig()): string {
  if (!cfg.enabled) return body;
  if (/\bunsubscribe\b|\bopt[\s-]?out\b/i.test(body)) return body; // already compliant
  const lines = ["—"];
  if (cfg.orgName) lines.push(cfg.orgName);
  if (cfg.address) lines.push(cfg.address);
  lines.push('Reply "unsubscribe" and I\'ll take you off my list.');
  return `${body}\n\n${lines.join("\n")}`;
}

/** Append SMS opt-out instructions ("Reply STOP to opt out") unless already present. */
export function appendSmsCompliance(body: string, cfg: ComplianceConfig = complianceConfig()): string {
  if (!cfg.enabled) return body;
  if (/\bstop\b/i.test(body)) return body; // already mentions opt-out
  return `${body} Reply STOP to opt out.`;
}
