"use client";

import { useState } from "react";
import { captureVisit, fireBrowserEvent, readAttributionClient } from "@/components/ads/browser";

export function ReactivationForm() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const file = data.get("file");
    let leads = String(data.get("leads") ?? "");
    if (file instanceof File && file.size) leads = await file.text();
    const test = new URLSearchParams(window.location.search).get("test") === "1";
    captureVisit();
    const res = await fetch("/api/offers/reactivation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        leads,
        consent: data.get("consent") === "on",
        test,
        attribution: readAttributionClient(),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; status?: string; eventId?: string; estimate?: { reachable: number; reachableNow: number; unique: number } };
    setError(!res.ok);
    if (res.ok && body.eventId) {
      fireBrowserEvent("Lead", body.eventId);
      document.cookie = "rr_ads_pixel=; Path=/; Max-Age=0";
    }
    setStatus(res.ok && body.estimate
      ? `Draft saved. ${body.estimate.unique} unique, ${body.estimate.reachable} reachable, ${body.estimate.reachableNow} reachable right now. Nothing was sent.`
      : body.error || "That did not send.");
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-surface p-5">
      <label className="block text-sm">Your name<input name="name" required className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" /></label>
      <label className="block text-sm">Your email<input name="email" type="email" required className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" /></label>
      <label className="block text-sm">Paste leads (name, email, phone, timezone)
        <textarea name="leads" rows={6} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs" placeholder={"Sam Taylor, sam@example.com, +15555550100, America/New_York"} />
      </label>
      <label className="block text-sm">Or upload a CSV<input name="file" type="file" accept=".csv,text/csv,text/plain" className="mt-1 block text-sm" /></label>
      <label className="flex items-start gap-2 text-sm"><input name="consent" type="checkbox" required className="mt-1" /><span>I attest these people consented to be contacted, or I will not approve a send. STOP and quiet hours still apply.</span></label>
      <button className="rounded-full bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white" type="submit">Build the draft</button>
      {status ? <p className={error ? "text-sm text-danger" : "text-sm text-success"} role="status">{status}</p> : null}
    </form>
  );
}
