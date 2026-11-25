"use client";

import { useMemo, useState } from "react";
import { UTM_CONVENTION, buildTrackedUrl } from "@/lib/ads/naming";

export function AdsTools({ origin }: { origin: string }) {
  const [source, setSource] = useState("meta");
  const [medium, setMedium] = useState("paid_social");
  const [campaign, setCampaign] = useState("webinar-coaches-202611");
  const [content, setContent] = useState("hook-a");
  const [term, setTerm] = useState("");
  const [path, setPath] = useState("/");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const url = useMemo(
    () => buildTrackedUrl({ origin, path, source, medium, campaign, content, term }),
    [origin, path, source, medium, campaign, content, term],
  );

  async function saveSpend(form: FormData) {
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/ads/spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: form.get("date"),
        source: form.get("source"),
        campaign: form.get("campaign"),
        amount: Number(form.get("amount")),
        currency: "USD",
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setNotice(res.ok ? "Spend saved." : body.error || "Could not save spend.");
    setBusy(false);
    if (res.ok) window.location.reload();
  }

  async function uploadCsv(file: File) {
    setBusy(true);
    setNotice(null);
    const csv = await file.text();
    const res = await fetch("/api/ads/spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const body = (await res.json().catch(() => ({}))) as { saved?: number; errors?: string[]; error?: string };
    setNotice(res.ok ? `Saved ${body.saved ?? 0} rows.${body.errors?.length ? ` ${body.errors.length} skipped.` : ""}` : body.error || "Could not read that file.");
    setBusy(false);
    if (res.ok) window.location.reload();
  }

  async function sendTests() {
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/ads/test", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { error?: string; metaConfigured?: boolean; testEventCode?: boolean; ga4Configured?: boolean };
    if (!res.ok) setNotice(body.error || "Test events were not sent.");
    else if (!body.metaConfigured) setNotice("Recorded locally. Meta was skipped — META_PIXEL_ID and META_CAPI_TOKEN are not set.");
    else if (!body.testEventCode) setNotice("Meta is configured, but META_TEST_EVENT_CODE is empty, so Events Manager will not show a test.");
    else setNotice(`Sent one of each event to Meta test events${body.ga4Configured ? " and GA4" : ""}.`);
    setBusy(false);
  }

  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-2">
      <section className="card">
        <h2 className="font-semibold text-fg">Spend</h2>
        <p className="mt-1 text-sm text-muted">One row per campaign per day. CSV columns: date, campaign, spend, and optionally source and currency.</p>
        <form
          className="mt-4 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveSpend(new FormData(e.currentTarget));
          }}
        >
          <input name="date" type="date" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <input name="source" placeholder="meta" defaultValue="meta" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <input name="campaign" placeholder="webinar-coaches-202611" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:col-span-2" />
          <input name="amount" type="number" min="0" step="0.01" placeholder="Spend in USD" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <button disabled={busy} className="rounded-lg bg-brand-strong px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Save spend</button>
        </form>
        <label className="mt-3 block text-sm text-muted">
          CSV upload
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadCsv(file);
            }}
          />
        </label>
      </section>

      <section className="card">
        <h2 className="font-semibold text-fg">Link builder</h2>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {UTM_CONVENTION.map((row) => (
            <li key={row.field}>
              <span className="font-mono text-fg">{row.field}</span> — {row.rule}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" aria-label="Source">
            <option value="meta">meta</option>
            <option value="google">google</option>
            <option value="youtube">youtube</option>
          </select>
          <select value={medium} onChange={(e) => setMedium(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" aria-label="Medium">
            <option value="paid_social">paid_social</option>
            <option value="cpc">cpc</option>
            <option value="video">video</option>
          </select>
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:col-span-2" aria-label="Campaign" />
          <input value={content} onChange={(e) => setContent(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" aria-label="Ad name" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="keyword" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" aria-label="Keyword" />
          <select value={path} onChange={(e) => setPath(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:col-span-2" aria-label="Landing page">
            <option value="/">Home</option>
            <option value="/pricing">Pricing</option>
            <option value="/signup">Signup</option>
          </select>
        </div>
        <input readOnly value={url} className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-fg" aria-label="Tracked URL" />
        <button type="button" disabled={busy} onClick={() => void sendTests()} className="mt-3 rounded-lg border border-border px-3 py-2 text-sm text-fg">
          Send test events
        </button>
        {notice ? <p className="mt-2 text-sm text-muted">{notice}</p> : null}
      </section>
    </div>
  );
}
