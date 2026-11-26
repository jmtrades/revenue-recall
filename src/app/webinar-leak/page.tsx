import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { LeakCalculator } from "@/components/marketing/LeakCalculator";
import { webinarLeak } from "@/lib/webinar/leak";

const DESCRIPTION = "See the monthly revenue walking out of a webinar when registrants do not show. Built for high-ticket coaches, consultants, and course creators.";

export const metadata: Metadata = {
  title: "Webinar leak calculator",
  description: DESCRIPTION,
  alternates: { canonical: "/webinar-leak" },
  openGraph: { title: "What your webinar is leaking", description: DESCRIPTION },
};

const example = webinarLeak({ registrants: 100, showRate: 0.4, offerPrice: 2000, closeRate: 0.1 });

export default function WebinarLeakPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">For coaches, consultants, and course creators</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-fg sm:text-5xl">What your webinar leaks every month</h1>
        <p className="mt-4 max-w-2xl text-lg text-body">
          An example with 100 registrants, a 40% show rate, a $2,000 offer, and a 10% close rate of attendees is {example ? `$${Math.round(example.leaked).toLocaleString("en-US")}` : "the figure below"}. Change the inputs to your own numbers.
        </p>
        <div className="mt-10">
          <LeakCalculator />
        </div>
        <p className="mt-10 text-sm text-muted">
          <Link href="/signup" className="text-brand hover:underline">Start the recovery</Link>
          {" · "}
          <Link href="/" className="text-brand hover:underline">Back to the product</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}
