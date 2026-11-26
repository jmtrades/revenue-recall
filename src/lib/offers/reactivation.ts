import { isHardOptOut } from "@/lib/agent/guardrails";
import { blockedEmail } from "@/lib/offers/catalog";

export interface ParsedLead {
  name: string;
  email: string;
  phone: string;
  timezone: string;
  optedOut: boolean;
}

export interface ReactivationEstimate {
  rows: number;
  unique: number;
  invalid: number;
  blocked: number;
  optedOut: number;
  reachable: number;
  reachableNow: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cells(line: string): string[] {
  return line.split(/[,\t]/).map((s) => s.trim().replace(/^"|"$/g, ""));
}

export function parseLeadList(raw: string): { leads: ParsedLead[]; invalid: number } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const leads: ParsedLead[] = [];
  let invalid = 0;
  for (const line of lines) {
    if (/^name\b/i.test(line) && /email/i.test(line)) continue;
    const parts = cells(line);
    const [name = "", email = "", phone = "", timezone = ""] = parts;
    const cleanEmail = email.toLowerCase();
    const phoneDigits = phone.replace(/\D/g, "");
    if (!name || (!EMAIL_RE.test(cleanEmail) && phoneDigits.length < 8)) {
      invalid += 1;
      continue;
    }
    leads.push({
      name: name.slice(0, 200),
      email: EMAIL_RE.test(cleanEmail) ? cleanEmail : "",
      phone: phone.slice(0, 40),
      timezone: timezone.replace(/\bstop\b/i, "").trim() || "America/New_York",
      optedOut: isHardOptOut(line) || parts.some((c) => /^(stop|stopall|unsubscribe|opted out|opt-out|do not contact)$/i.test(c)),
    });
  }
  return { leads, invalid };
}

export function dedupeLeads(leads: ParsedLead[]): ParsedLead[] {
  const seen = new Set<string>();
  const out: ParsedLead[] = [];
  for (const lead of leads) {
    const key = lead.email || lead.phone.replace(/\D/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}

function quietNow(now: Date, tz: string): boolean {
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
    return hour >= 21 || hour < 8;
  } catch {
    return false;
  }
}

export function estimateReactivation(leads: ParsedLead[], now = new Date()): ReactivationEstimate {
  let blocked = 0;
  let optedOut = 0;
  let reachable = 0;
  let reachableNow = 0;
  for (const lead of leads) {
    if (blockedEmail(lead.email)) {
      blocked += 1;
      continue;
    }
    if (lead.optedOut) {
      optedOut += 1;
      continue;
    }
    const canReach = Boolean(lead.email || lead.phone.replace(/\D/g, "").length >= 8);
    if (!canReach) continue;
    reachable += 1;
    if (!quietNow(now, lead.timezone)) reachableNow += 1;
  }
  return { rows: leads.length, unique: leads.length, invalid: 0, blocked, optedOut, reachable, reachableNow };
}
