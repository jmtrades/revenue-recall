import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";

/**
 * Booking analytics for the Reports page. The pure aggregation is split out so
 * it's trivially testable; the DB read degrades to zeros without a database.
 */
export interface BookingStats {
  /** Confirmed meetings still in the future. */
  upcoming: number;
  /** Confirmed bookings created in the last 30 days. */
  booked30d: number;
  /** Cancelled bookings (created in the last 30 days). */
  cancelled30d: number;
  /** cancelled / (booked + cancelled) over the 30-day window, 0..1. */
  cancelRate: number;
  /** Bookings created per week over the last 6 weeks (oldest → newest). */
  trend: { label: string; value: number }[];
  /** True when the org has any bookings at all (drives the empty state). */
  any: boolean;
}

export interface BookingStatRow {
  status: string;
  startsAt: string;
  createdAt: string;
}

const DAY = 86_400_000;

export function aggregateBookingStats(rows: BookingStatRow[], now: Date = new Date()): BookingStats {
  const nowMs = now.getTime();
  let upcoming = 0;
  let booked30d = 0;
  let cancelled30d = 0;
  const weeks = [0, 0, 0, 0, 0, 0]; // index 0 = this week … 5 = five weeks ago

  for (const r of rows) {
    const created = Date.parse(r.createdAt);
    const start = Date.parse(r.startsAt);
    if (r.status === "confirmed" && Number.isFinite(start) && start >= nowMs) upcoming++;
    if (Number.isFinite(created) && nowMs - created <= 30 * DAY) {
      if (r.status === "cancelled") cancelled30d++;
      else booked30d++;
    }
    if (Number.isFinite(created)) {
      const wk = Math.floor((nowMs - created) / (7 * DAY));
      if (wk >= 0 && wk < 6) weeks[wk]++;
    }
  }

  const totalReq = booked30d + cancelled30d;
  const trend: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(nowMs - i * 7 * DAY);
    trend.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: weeks[i] });
  }

  return {
    upcoming,
    booked30d,
    cancelled30d,
    cancelRate: totalReq > 0 ? cancelled30d / totalReq : 0,
    trend,
    any: rows.length > 0,
  };
}

/** Org-scoped booking analytics. Never throws (no DB / before the migration →
 *  zeros, so the Reports page renders an empty state). */
export async function bookingStats(): Promise<BookingStats> {
  const empty = aggregateBookingStats([]);
  const client = getSupabase();
  if (!client) return empty;
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return empty;
  const { data, error } = await client
    .from("bookings")
    .select("status,starts_at,created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) return empty;
  const rows = ((data as { status: string; starts_at: string; created_at: string }[] | null) ?? []).map((r) => ({ status: r.status, startsAt: r.starts_at, createdAt: r.created_at }));
  return aggregateBookingStats(rows);
}
