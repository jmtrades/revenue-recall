export function money(value: number, currency = "USD"): string {
  if (!Number.isFinite(value)) value = 0; // never render "$NaN" on a bad input
  // ≥$1M: use the hydration-safe manual compact formatter. Intl's compact
  // notation renders differently under Node ICU vs browser ICU ("$0" vs "$0.0"),
  // which throws a React hydration mismatch in the client components that render
  // money directly (RecallQueue, LeadsTable). See compactMoney's note below.
  if (Math.abs(value) >= 1_000_000) return compactMoney(value, currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "$", AUD: "$", JPY: "¥", INR: "₹" };

/**
 * Compact money ($1.2K, $3.4M). Implemented manually rather than via
 * Intl.NumberFormat({notation:"compact"}) because Node's ICU and the browser's
 * ICU format compact notation differently (e.g. "$0" vs "$0.0"), which causes
 * React hydration mismatches in client components. Manual formatting is
 * identical on server and client.
 */
export function compactMoney(value: number, currency = "USD"): string {
  const sym = CURRENCY_SYMBOL[currency] ?? "";
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  const fmt = (v: number) => {
    // One decimal, but drop a trailing ".0".
    const s = v.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  };
  let body: string;
  if (n >= 1_000_000_000) body = `${fmt(n / 1_000_000_000)}B`;
  else if (n >= 1_000_000) body = `${fmt(n / 1_000_000)}M`;
  else if (n >= 1_000) body = `${fmt(n / 1_000)}K`;
  else body = String(Math.round(n));
  const prefix = sym || (currency ? `${currency} ` : "");
  return `${sign}${prefix}${body}`;
}

export function relativeDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}

export function pct(n: number): string {
  return `${Number.isFinite(n) ? Math.round(n * 100) : 0}%`;
}
