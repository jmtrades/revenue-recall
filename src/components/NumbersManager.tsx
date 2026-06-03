"use client";

import { useState } from "react";

interface PhoneNumber {
  number: string;
  label?: string;
  capabilities?: { sms?: boolean; voice?: boolean };
  status?: string;
  monthlyCostUsd?: number;
}

const caps = (n: PhoneNumber) => [n.capabilities?.sms && "SMS", n.capabilities?.voice && "Voice"].filter(Boolean).join(" · ");

/**
 * Search, buy, and manage phone numbers through whatever provider is connected.
 * When none is connected it still shows the bring-your-own number and explains
 * how to connect one. All actions go through /api/numbers (provider-agnostic).
 */
export function NumbersManager({ configured, provider, byoNumber, initialOwned, initialCallerId }: { configured: boolean; provider: string; byoNumber: string | null; initialOwned: PhoneNumber[]; initialCallerId?: string | null }) {
  const [owned, setOwned] = useState<PhoneNumber[]>(initialOwned);
  const [callerId, setCallerId] = useState<string | null>(initialCallerId ?? null);
  const [areaCode, setAreaCode] = useState("");
  const [results, setResults] = useState<PhoneNumber[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function chooseCallerId(number: string) {
    setBusy(number);
    setError(null);
    try {
      const res = await fetch("/api/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_caller_id", number }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setCallerId(data.callerId ?? number);
      setNotice(`Calls and texts now come from ${number}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function search() {
    setBusy("search");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", areaCode: areaCode || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }

  async function buy(number: string) {
    setBusy(number);
    setError(null);
    try {
      const res = await fetch("/api/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buy", number }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Purchase failed");
      setOwned((prev) => [data.bought as PhoneNumber, ...prev]);
      setResults((prev) => (prev ? prev.filter((r) => r.number !== number) : prev));
      setNotice(`${number} added to your numbers.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setBusy(null);
    }
  }

  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2/40 p-3 text-sm">
        <span className="text-muted">Buy / manage numbers</span>
        <span className={`pill ${configured ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>
          {configured ? `Connected · ${provider}` : "Not connected"}
        </span>
      </div>

      {/* Owned */}
      <div>
        <p className="stat-label">Your numbers</p>
        {owned.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No numbers yet. {byoNumber ? "" : "Connect your own number, or get one below."}</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {owned.map((n) => (
              <li key={n.number} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="font-mono text-sm text-fg">{n.number}</span>
                  {n.label && <span className="ml-2 text-xs text-muted">{n.label}</span>}
                  <span className="ml-2 text-xs text-muted">{caps(n) || "owned"}</span>
                </div>
                {callerId === n.number ? (
                  <span className="pill bg-brand/15 text-brand text-[11px]">Caller ID</span>
                ) : (
                  <button onClick={() => chooseCallerId(n.number)} disabled={busy !== null} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:text-fg disabled:opacity-50">
                    {busy === n.number ? "Saving…" : "Use as caller ID"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Search + buy */}
      {configured ? (
        <div>
          <p className="stat-label">Find a new number</p>
          <div className="mt-1 flex items-center gap-2">
            <input className={`${input} w-28`} value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="Area code" />
            <button onClick={search} disabled={busy !== null} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
              {busy === "search" ? "Searching…" : "Search"}
            </button>
          </div>
          {results && (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
              {results.length === 0 ? (
                <li className="px-3 py-3 text-sm text-muted">No numbers available — try a different area code.</li>
              ) : (
                results.map((n) => (
                  <li key={n.number} className="flex items-center justify-between px-3 py-2.5">
                    <div>
                      <span className="font-mono text-sm text-fg">{n.number}</span>
                      <span className="ml-2 text-xs text-muted">{caps(n)}{n.monthlyCostUsd != null ? ` · $${n.monthlyCostUsd}/mo` : ""}</span>
                    </div>
                    <button onClick={() => buy(n.number)} disabled={busy !== null} className="rounded-lg border border-brand/40 bg-brand-soft/30 px-3 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft/50 disabled:opacity-50">
                      {busy === n.number ? "Buying…" : "Buy"}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">
          Connect your telephony to search and buy numbers right here — no lock-in. Or bring a number you already own.
        </p>
      )}

      {notice && <p className="text-sm text-success">{notice}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
