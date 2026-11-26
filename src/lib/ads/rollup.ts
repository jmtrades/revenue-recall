import type { SpendRow, StoredEvent } from "@/lib/ads/store";

export interface AdsTotals {
  leads: number;
  bookings: number;
  sales: number;
  revenue: number;
  spend: number;
  currency: string;
  mixedCurrency: boolean;
  cpl: number | null;
  costPerBooking: number | null;
  cac: number | null;
  roas: number | null;
}

export interface AdsSlice {
  key: string;
  leads: number;
  bookings: number;
  sales: number;
  revenue: number;
  spend: number;
  qualified?: number;
  shows?: number;
  noShows?: number;
  showRate?: number | null;
  costPerQualified?: number | null;
}

export interface AdsReport {
  totals: AdsTotals;
  bySource: AdsSlice[];
  byCampaign: AdsSlice[];
  byAd: AdsSlice[];
  byOffer: AdsSlice[];
}

function inRange(iso: string, from: string | null, to: string | null): boolean {
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function ratio(spend: number, count: number): number | null {
  if (count <= 0 || spend <= 0) return null;
  return spend / count;
}

function finish(partial: Omit<AdsTotals, "cpl" | "costPerBooking" | "cac" | "roas">): AdsTotals {
  return {
    ...partial,
    cpl: ratio(partial.spend, partial.leads),
    costPerBooking: ratio(partial.spend, partial.bookings),
    cac: ratio(partial.spend, partial.sales),
    roas: partial.spend > 0 ? partial.revenue / partial.spend : null,
  };
}

export function adsReport(events: StoredEvent[], spend: SpendRow[], from: string | null, to: string | null): AdsReport {
  const live = events.filter((e) => !e.test && inRange(e.at, from, to));
  const costs = spend.filter((s) => inRange(s.date, from, to));
  const currencies = new Set(costs.map((s) => s.currency || "USD"));
  const currency = currencies.values().next().value || "USD";
  const mixedCurrency = currencies.size > 1;
  const counted = mixedCurrency ? costs.filter((s) => (s.currency || "USD") === currency) : costs;

  const totals = finish({
    leads: live.filter((e) => e.name === "Lead").length,
    bookings: live.filter((e) => e.name === "Schedule" && e.scheduleKind !== "no_show" && e.scheduleKind !== "show").length,
    sales: live.filter((e) => e.name === "Purchase").length,
    revenue: live.filter((e) => e.name === "Purchase").reduce((sum, e) => sum + (e.value ?? 0), 0),
    spend: counted.reduce((sum, s) => sum + s.amount, 0),
    currency,
    mixedCurrency,
  });

  const buckets = new Map<string, AdsSlice>();
  const slice = (key: string) => {
    let row = buckets.get(key);
    if (!row) {
      row = { key, leads: 0, bookings: 0, sales: 0, revenue: 0, spend: 0 };
      buckets.set(key, row);
    }
    return row;
  };

  const groups = (pick: (e: StoredEvent) => string, spendPick: (s: SpendRow) => string) => {
    buckets.clear();
    for (const e of live) {
      const row = slice(pick(e) || "(not set)");
      if (e.name === "Lead") row.leads += 1;
      if (e.qualified) row.qualified = (row.qualified ?? 0) + 1;
      if (e.name === "Schedule" && e.scheduleKind !== "no_show" && e.scheduleKind !== "show") row.bookings += 1;
      if (e.scheduleKind === "show") row.shows = (row.shows ?? 0) + 1;
      if (e.scheduleKind === "no_show") row.noShows = (row.noShows ?? 0) + 1;
      if (e.name === "Purchase") {
        row.sales += 1;
        row.revenue += e.value ?? 0;
      }
    }
    for (const s of counted) slice(spendPick(s) || "(not set)").spend += s.amount;
    return [...buckets.values()].filter((r) => r.leads || r.bookings || r.sales || r.spend || r.qualified || r.shows || r.noShows).map((row) => ({
      ...row,
      showRate: row.bookings ? (row.shows ?? 0) / row.bookings : null,
      costPerQualified: row.qualified ? row.spend / row.qualified : null,
    })).sort((a, b) => b.spend - a.spend || b.leads - a.leads || a.key.localeCompare(b.key));
  };

  return {
    totals,
    bySource: groups((e) => e.source, (s) => s.source),
    byCampaign: groups((e) => e.campaign, (s) => s.campaign),
    byAd: groups((e) => e.content, () => ""),
    byOffer: groups((e) => e.offer || e.campaign, (s) => s.campaign),
  };
}

export function rangeBounds(range: string, today = new Date()): { from: string | null; to: string | null } {
  const to = today.toISOString().slice(0, 10);
  if (range === "all") return { from: null, to: null };
  const days = range === "7" ? 7 : range === "90" ? 90 : 30;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to };
}
