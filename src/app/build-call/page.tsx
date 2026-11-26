import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "Book the AI setting team",
  description: "A 15-minute call to build your AI appointment-setting team.",
};

export default function BuildCallPage() {
  const href = process.env.BOOKING_URL || "/book/local";
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">15-minute build call</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Book the setting team.</h1>
        <p className="mt-4 text-lg text-body">Fifteen minutes to wire speed to lead, follow-up, triage, no-show recovery, and reactivation. When the calendar confirms, the booking webhook at /api/ads/schedule records it. A no-show starts the rebook sequence.</p>
        <a href={href} className="mt-8 inline-flex rounded-full bg-brand-strong px-5 py-2.5 text-sm font-semibold text-white">Pick a time</a>
      </main>
      <Footer />
    </div>
  );
}
