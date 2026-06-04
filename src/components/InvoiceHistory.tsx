"use client";

import { useEffect, useState } from "react";

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
 *  this renders nothing). Finance teams expect receipts inside the product. */
export function InvoiceHistory() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    fetch("/api/billing/invoices", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403 || r.status === 401) {
          setHidden(true);
          return;
        }
        if (!r.ok) return;
        const d = (await r.json()) as { invoices?: Invoice[] };
        setInvoices(d.invoices ?? []);
      })
      .catch(() => undefined);
  }, []);

  if (hidden) return null;

  return (
    <div className="mt-5 space-y-2 border-t border-border pt-5">
      <p className="stat-label">Invoices</p>
      {invoices === null ? (
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
