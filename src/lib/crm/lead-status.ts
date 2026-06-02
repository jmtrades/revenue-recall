/**
 * Lead lifecycle status — the editable "where is this person in our funnel"
 * field that the built-in CRM was missing (pipeline stages track DEALS; this
 * tracks the CONTACT). Stored on contact.attributes.status, so no schema change.
 * Pure + client-safe (the leads table imports the labels), so it's importable
 * anywhere and unit-testable without a DB.
 */

export const LEAD_STATUSES = ["new", "working", "qualified", "unqualified", "customer"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  working: "Working",
  qualified: "Qualified",
  unqualified: "Unqualified",
  customer: "Customer",
};

/** Tailwind classes for the status pill, so it reads at a glance. */
export const LEAD_STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-surface-2 text-muted",
  working: "bg-brand/15 text-brand",
  qualified: "bg-success/15 text-success",
  unqualified: "bg-surface-2 text-muted",
  customer: "bg-success/20 text-success",
};

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

/** Coerce an arbitrary stored value to a known status, or undefined. */
export function normalizeLeadStatus(v: unknown): LeadStatus | undefined {
  return isLeadStatus(v) ? v : undefined;
}

export function leadStatusLabel(v: unknown): string {
  const s = normalizeLeadStatus(v);
  return s ? LEAD_STATUS_LABELS[s] : "—";
}
