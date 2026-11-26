"use client";

import { useState } from "react";
import { captureVisit, fireBrowserEvent, readAttributionClient } from "@/components/ads/browser";

export function SetterDemoForm() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const test = new URLSearchParams(window.location.search).get("test") === "1";
    captureVisit();
    const eventId = crypto.randomUUID();
    const res = await fetch("/api/offers/setter-demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        phone: data.get("phone"),
        email: data.get("email"),
        business: data.get("business"),
        monthlyRevenue: Number(data.get("monthlyRevenue") || 0),
        consent: data.get("consent") === "on",
        website: data.get("website"),
        test,
        eventId,
        attribution: readAttributionClient(),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string; call?: string; bookingUrl?: string; eventId?: string };
    setError(!res.ok);
    if (res.ok && body.eventId) {
      fireBrowserEvent("Lead", body.eventId);
      document.cookie = "rr_ads_pixel=; Path=/; Max-Age=0";
    }
    setStatus(res.ok ? `Saved. Call ${body.call}. ${body.reason === "twilio_trial_unverified" ? "Trial numbers that are not verified are not dialed." : ""} ${body.bookingUrl || ""}` : body.error || "That did not send.");
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-surface p-5">
      <label className="block text-sm">Name<input name="name" required className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" autoComplete="name" /></label>
      <label className="block text-sm">Phone<input name="phone" required type="tel" className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" autoComplete="tel" /></label>
      <label className="block text-sm">Email<input name="email" required type="email" className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" autoComplete="email" /></label>
      <label className="block text-sm">Business<input name="business" required className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" /></label>
      <label className="block text-sm">Monthly revenue<input name="monthlyRevenue" inputMode="numeric" className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" /></label>
      <label className="flex items-start gap-2 text-sm"><input name="consent" type="checkbox" required className="mt-1" /><span>I agree to a call, text, and email about this demo. I can reply STOP to opt out.</span></label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <button className="rounded-full bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white" type="submit">Call me</button>
      {status ? <p className={error ? "text-sm text-danger" : "text-sm text-success"} role="status">{status}</p> : null}
    </form>
  );
}
