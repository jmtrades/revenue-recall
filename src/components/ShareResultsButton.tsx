"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { compactMoney } from "@/lib/format";

/**
 * Share-your-results affordance — the compliant half of the "trust layer": it
 * surfaces the workspace's OWN, real recovered-revenue numbers as a copyable
 * one-liner a customer can paste into a review, post, or testimonial. Strictly
 * factual (the customer's actual won-back count + value) — no fabricated stats,
 * no guarantees — so it feeds marketing honestly, in line with the product's
 * no-unverified-claims bar. Only rendered when there's a real result to share.
 */
export function ShareResultsButton({
  recoveredValue,
  wonBack,
  currency,
  topChannel,
}: {
  recoveredValue: number;
  wonBack: number;
  currency: string;
  topChannel?: string;
}) {
  const [copied, setCopied] = useState(false);

  function share() {
    const deals = wonBack === 1 ? "deal" : "deals";
    const via = topChannel ? `, mostly over ${topChannel}` : "";
    const text = `With Revenue Recall we've won back ${wonBack} ${deals} worth ${compactMoney(recoveredValue, currency)} that had gone cold${via}. (recall-touch.com)`;
    const ok = () => {
      setCopied(true);
      toast("Results copied — paste it into a review or post");
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(ok, () => toast("Couldn't copy — select the numbers above to share manually", "error"));
    } else {
      toast("Couldn't copy — select the numbers above to share manually", "error");
    }
  }

  return (
    <button onClick={share} className="text-sm text-brand hover:underline" aria-label="Copy your recovered-revenue results to share">
      {copied ? "Copied ✓" : "Share results"}
    </button>
  );
}
