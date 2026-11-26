"use client";

import { useMemo, useState } from "react";
import { webinarLeak } from "@/lib/webinar/leak";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Example inputs only. They are not a measured result. */
const EXAMPLE = { registrants: "100", show: "40", price: "2000", close: "10" };

export function LeakCalculator() {
  const [registrants, setRegistrants] = useState(EXAMPLE.registrants);
  const [show, setShow] = useState(EXAMPLE.show);
  const [price, setPrice] = useState(EXAMPLE.price);
  const [close, setClose] = useState(EXAMPLE.close);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const leak = useMemo(
    () =>
      webinarLeak({
        registrants: Number(registrants),
        showRate: Number(show) / 100,
        offerPrice: Number(price),
        closeRate: Number(close) / 100,
      }),
    [registrants, show, price, close],
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("idle");
    const data = new FormData(e.currentTarget);
    const res = await fetch("/api/webinar-leak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        consent,
        website: String(data.get("website") ?? ""),
        registrants: Number(registrants),
        showRate: Number(show) / 100,
        offerPrice: Number(price),
        closeRate: Number(close) / 100,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setStatus("error");
      setMessage(body.error || "That did not send.");
      return;
    }
    setStatus("sent");
    setMessage("Got it. We will use this number and your contact details to follow up about the leak.");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-muted">These fields are an example until you change them. They are not a claim about a real webinar.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-fg">Registrants a month
            <input inputMode="numeric" value={registrants} onChange={(e) => setRegistrants(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" />
          </label>
          <label className="text-sm text-fg">Show rate %
            <input inputMode="decimal" value={show} onChange={(e) => setShow(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" />
          </label>
          <label className="text-sm text-fg">Offer price
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" />
          </label>
          <label className="text-sm text-fg">Close rate of attendees %
            <input inputMode="decimal" value={close} onChange={(e) => setClose(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" />
          </label>
        </div>
        <p className="text-3xl font-semibold tracking-tight text-fg">{leak ? money.format(leak.leaked) : "—"}</p>
        <p className="text-sm text-muted">
          {leak
            ? `${Math.round(leak.missed)} people never see the pitch. At the close rate of the people who stayed, that is the monthly leak.`
            : "Enter a show rate and a close rate between 0 and 100."}
        </p>
        <label className="block text-sm text-fg">Name
          <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" autoComplete="name" />
        </label>
        <label className="block text-sm text-fg">Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" autoComplete="email" />
        </label>
        <label className="block text-sm text-fg">Phone
          <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2" autoComplete="tel" />
        </label>
        <label className="flex items-start gap-2 text-sm text-body">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>I agree to be contacted about this number by email, text, and phone. I can reply STOP to opt out.</span>
        </label>
        <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <button className="rounded-full bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white" type="submit">Send me the follow-up</button>
        {message ? <p className={status === "error" ? "text-sm text-danger" : "text-sm text-success"} role="status">{message}</p> : null}
      </form>
      <div className="text-sm leading-relaxed text-body">
        <p className="text-lg font-semibold text-fg">Someone just left the webinar before the pitch. Their phone is already ringing.</p>
        <p className="mt-4">The calculator prices the people who registered and did not show, using your offer price and the close rate of the people who stayed. It does not invent a result, a testimonial, or a guarantee.</p>
        <p className="mt-4">The follow-up is a real lead in the same pipeline as a Meta instant form. It is worked by the sales team, and it shows up under ad attribution when the visit carried a campaign.</p>
      </div>
    </div>
  );
}
