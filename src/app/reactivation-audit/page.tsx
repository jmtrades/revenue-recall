import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { ReactivationForm } from "@/components/offers/ReactivationForm";

export const metadata: Metadata = {
  title: "Free dead-lead reactivation audit",
  description: "Upload old leads. We estimate who can still be reached. Nothing is sent until you approve a draft.",
};

export default function ReactivationAuditPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Free dead-lead reactivation audit</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">See which old leads are still reachable.</h1>
        <p className="mt-4 text-lg text-body">Paste or upload a list. We dedupe it, drop STOP and blocked inboxes, and hold the campaign as a draft. Quiet hours are 9pm to 8am in the lead&apos;s timezone. Nothing sends on its own.</p>
        <div className="mt-8">
          <ReactivationForm />
        </div>
      </main>
      <Footer />
    </div>
  );
}
