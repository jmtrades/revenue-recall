import type { LeadStatus } from "@/lib/crm/lead-status";

/**
 * Smart segments — one-click views over the leads table. Pure predicates over
 * the minimal row shape, so they're client-safe (the table imports them) and
 * unit-testable without a DB. These are the combos the plain status/owner
 * filters can't express (untriaged leads, the high-value tail), surfaced as
 * fast presets with live counts.
 */

export interface SegmentRow {
  status?: LeadStatus;
  value: number | null;
}

export interface SegmentCtx {
  /** Value at/above which a deal counts as "high value" (the pipeline's top quartile). */
  highValueThreshold: number;
}

export interface Segment {
  id: string;
  label: string;
  match: (r: SegmentRow, ctx: SegmentCtx) => boolean;
}

export const SEGMENTS: Segment[] = [
  { id: "all", label: "All", match: () => true },
  { id: "no_status", label: "Needs triage", match: (r) => !r.status },
  { id: "working", label: "Working", match: (r) => r.status === "working" },
  { id: "qualified", label: "Qualified", match: (r) => r.status === "qualified" },
  { id: "customer", label: "Customers", match: (r) => r.status === "customer" },
  { id: "high_value", label: "High value", match: (r, ctx) => Number.isFinite(ctx.highValueThreshold) && r.value != null && r.value >= ctx.highValueThreshold },
];

export function getSegment(id: string): Segment {
  return SEGMENTS.find((s) => s.id === id) ?? SEGMENTS[0];
}

/**
 * The high-value cutoff = the 75th-percentile positive deal value, so "High
 * value" always means the genuine top of *this* workspace's pipeline (not a
 * hard-coded number that's wrong for every business). Returns Infinity when
 * there are no positive values, so the segment matches nothing rather than
 * everything.
 */
export function highValueThreshold(values: Array<number | null>): number {
  const positive = values.filter((v): v is number => typeof v === "number" && v > 0).sort((a, b) => a - b);
  if (positive.length === 0) return Infinity;
  const idx = Math.min(Math.floor(positive.length * 0.75), positive.length - 1);
  return positive[idx];
}
