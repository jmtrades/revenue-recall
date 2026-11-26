import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { SetterDemoForm } from "@/components/offers/SetterDemoForm";

export const metadata: Metadata = {
  title: "Free AI setter demo",
  description: "We call you in 60 seconds. An AI appointment setter for coaches, consultants, and course creators.",
};

export default function SetterDemoPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Free AI setter demo</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">We call you in 60 seconds.</h1>
        <p className="mt-4 text-lg text-body">Tell us who you are. The setter calls, texts, and emails, then offers a 15-minute build call. On a Twilio trial, an unverified number is logged instead of dialed.</p>
        <div className="mt-8">
          <SetterDemoForm />
        </div>
        <p className="mt-8 text-sm"><Link href="/build-call" className="text-brand hover:underline">Skip the demo and book the build call</Link></p>
      </main>
      <Footer />
    </div>
  );
}
