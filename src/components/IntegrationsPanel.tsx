"use client";

import { useEffect, useState } from "react";

interface Row {
  id: string;
  label: string;
  ok: boolean;
  missing: string;
  test: "email" | "sms" | "call" | "none";
}

export function IntegrationsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/integrations/status").then((r) => r.json()).then((d) => setRows(d.rows ?? [])).catch(() => setRows([]));
  }, []);

  async function send(row: Row) {
    setBusy(row.id);
    setNote(null);
    const to = row.test === "email" ? email : phone;
    const res = await fetch("/api/integrations/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, to }),
    });
    const data = await res.json().catch(() => ({}));
    setNote(data.message ?? data.error ?? (res.ok ? "Sent." : "That test didn't go out."));
    setBusy(null);
  }

  const field = "rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg";

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-sm font-medium text-fg">Integrations</h2>
        <p className="mt-1 text-sm text-muted">A green row means the key is on this host. A test send only leaves the building when that key exists.</p>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
            <div>
              <p className="text-sm text-fg">{row.label}</p>
              <p className="text-xs text-muted">{row.ok ? "Key present" : `Missing ${row.missing}`}</p>
            </div>
            <span className={`pill ${row.ok ? "bg-success/15 text-success" : "bg-warn/15 text-warn"}`}>{row.ok ? "Ready" : "Missing"}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input className={field} aria-label="Test email" placeholder="Email for a test" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={field} aria-label="Test phone" placeholder="Phone for a test" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {rows.filter((r) => r.test !== "none").map((row) => (
          <button key={row.id} type="button" disabled={busy === row.id} onClick={() => send(row)} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 disabled:opacity-50">
            {busy === row.id ? "Sending…" : `Test ${row.test}`}
          </button>
        ))}
      </div>
      {note && <p className="text-sm text-muted">{note}</p>}
    </section>
  );
}
