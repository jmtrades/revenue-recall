"use client";

import { useState } from "react";
import { useResource } from "@/lib/useResource";

interface Invoice {
  id: string;
  number?: string;
  amountPaid: number;
  currency: string;
  status: string;
  created: string;
  url?: string;
  pdf?: string;
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);

/** In-app invoice history (owner/admin only — the endpoint 403s otherwise, and
 *  this renders nothing). Finance teams expect receipts inside the product.
 *  Fetched via useResource (aborts on unmount, ignores stale responses). */
export function InvoiceHistory() {
  const [hidden, setHidden] = useState(false);
  const { data: invoices, loading } = useResource<Invoice[]>(
    "/api/billing/invoices",
    (json) => (json as { invoices?: Invoice[] }).invoices ?? [],
    {
      onStatus: (s) => {
        if (s === 403 || s === 401) {
          setHidden(true);
          return true;
        }
        return false;
      },
    },
  );

  if (hidden) return null;

  return (
    <div className="mt-5 space-y-2 border-t border-border pt-5">
      <p className="stat-label">Invoices</p>
      {loading || invoices === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted">No invoices yet — they appear here once billing starts.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div>
                <span className="font-medium text-fg">{money(inv.amountPaid, inv.currency)}</span>
                <span className="ml-2 text-xs text-muted">{inv.created ? new Date(inv.created).toLocaleDateString() : ""}</span>
                <span className={`ml-2 pill text-[10px] ${inv.status === "paid" ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>{inv.status}</span>
              </div>
              <span className="flex shrink-0 gap-3 text-xs">
                {inv.url && <a href={inv.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">View</a>}
                {inv.pdf && <a href={inv.pdf} target="_blank" rel="noreferrer" className="text-muted hover:text-fg">PDF</a>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
