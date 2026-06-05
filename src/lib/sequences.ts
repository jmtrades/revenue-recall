/**
 * Outreach sequences (cadences). Multi-step, multi-channel follow-up plans.
 * Shipped as templates so any industry has a working cadence on day one; these
 * map onto a CRM's tasks/workflows when one is connected.
 */

import type { DraftScenario } from "@/lib/ai/draft";

export type SeqChannel = "call" | "email" | "sms";

export interface SequenceStep {
  day: number;
  channel: SeqChannel;
  subject: string;
  body: string;
  /** Optional special message type for this step (e.g. a gracious "breakup" as
   *  the final touch). When set, the cadence drafts it with that scenario's tuned
   *  copy + coaching instead of a generic follow-up. */
  scenario?: DraftScenario;
}

export interface Sequence {
  id: string;
  name: string;
  goal: string;
  /** Industry ids this is most relevant to; "*" = universal. */
  industries: string[];
  steps: SequenceStep[];
}

export const SEQUENCES: Sequence[] = [
  {
    id: "recall",
    name: "Revenue Recall",
    goal: "Re-engage a deal that's gone cold or was marked lost.",
    industries: ["*"],
    steps: [
      { day: 0, channel: "email", subject: "worth picking back up?", body: "Ask straight whether it's still on their radar. Lead with a genuine reason, give an easy out." },
      { day: 3, channel: "call", subject: "Call attempt", body: "Reference the original goal; open with a fresh angle, not a guilt-trip about the gap." },
      { day: 7, channel: "sms", subject: "Soft nudge", body: "Short and low-pressure — happy to close the loop either way. Offer one concrete next step." },
      { day: 14, channel: "email", subject: "closing the file", body: "Last note before you archive it. Make it painless to say 'keep it open' or 'not now'.", scenario: "breakup" },
    ],
  },
  {
    id: "new_lead",
    name: "New Lead Speed-to-Lead",
    goal: "Reach a fresh inbound lead within minutes and book the next step.",
    industries: ["*"],
    steps: [
      { day: 0, channel: "call", subject: "Immediate call", body: "Call within 5 minutes of the lead arriving. Confirm what they need and the timeline." },
      { day: 0, channel: "sms", subject: "Text follow-up", body: "Missed you — when's good today? Keep it human and short." },
      { day: 1, channel: "email", subject: "next steps", body: "Recap what they're after and propose one concrete next step with a time." },
    ],
  },
  {
    id: "real_estate_listing",
    name: "Listing Appointment",
    goal: "Convert a seller lead into a signed listing.",
    industries: ["real_estate"],
    steps: [
      { day: 0, channel: "call", subject: "Intro call", body: "Understand the motivation, timeline, and the property itself." },
      { day: 1, channel: "email", subject: "your home's value", body: "Send a tailored CMA and one clear ask to meet this week." },
      { day: 4, channel: "sms", subject: "Walkthrough?", body: "Offer to swing by — ask what day works rather than if they're interested." },
    ],
  },
  {
    id: "mortgage_engage",
    name: "Rate & Pre-Approval",
    goal: "Move a borrower from inquiry to a locked, fundable loan.",
    industries: ["mortgage"],
    steps: [
      { day: 0, channel: "sms", subject: "Quick numbers", body: "Offer to run today's rate scenario; lead with the monthly payment." },
      { day: 2, channel: "call", subject: "Pre-approval", body: "Walk through what you need to pre-approve them fast; remove the friction." },
      { day: 6, channel: "email", subject: "before your quote expires", body: "Refresh the quote at current rates and make the next step obvious." },
    ],
  },
  {
    id: "insurance_renewal",
    name: "Renewal Win-Back",
    goal: "Shop a policy before renewal and keep or win the account.",
    industries: ["insurance"],
    steps: [
      { day: 0, channel: "email", subject: "your renewal's coming up", body: "Offer to shop it before it auto-renews; note coverage shifts year to year." },
      { day: 3, channel: "sms", subject: "Quick coverage check", body: "Offer a fast side-by-side so any savings are obvious. No obligation." },
      { day: 7, channel: "call", subject: "Review call", body: "Walk the comparison; confirm what's covered and close the gap." },
    ],
  },
  {
    id: "post_demo",
    name: "Post-Demo Follow-up",
    goal: "Keep momentum after a demo through to a decision.",
    industries: ["saas", "agency"],
    steps: [
      { day: 0, channel: "email", subject: "thanks + recap", body: "Summarize what landed, attach the proposal, suggest a decision date." },
      { day: 2, channel: "call", subject: "Questions?", body: "Surface the real objection and align on the remaining steps." },
      { day: 5, channel: "email", subject: "anything blocking?", body: "Offer to loop in stakeholders or adjust scope to fit budget." },
    ],
  },
  {
    id: "auto_test_drive",
    name: "Showroom Follow-up",
    goal: "Turn a test drive into a delivery.",
    industries: ["auto"],
    steps: [
      { day: 0, channel: "sms", subject: "Hold it?", body: "Mention the vehicle's still available but moving; offer to hold it." },
      { day: 2, channel: "call", subject: "Numbers", body: "Run payment options with their trade-in; hit the target payment." },
      { day: 5, channel: "email", subject: "new incentives", body: "Share any incentive change and offer another spin or delivery date." },
    ],
  },
  {
    id: "home_services_estimate",
    name: "Estimate to Install",
    goal: "Move a homeowner from estimate to a booked job.",
    industries: ["home_services"],
    steps: [
      { day: 0, channel: "sms", subject: "Site visit", body: "Offer to get a tech out this week; ask which day works." },
      { day: 2, channel: "call", subject: "Walk the quote", body: "If price is the snag, walk the quote line by line and offer options." },
      { day: 5, channel: "email", subject: "before the schedule fills", body: "Offer the next open slot and make booking a one-line reply." },
    ],
  },
];

export function sequencesFor(industryId: string): Sequence[] {
  return SEQUENCES.filter((s) => s.industries.includes("*") || s.industries.includes(industryId));
}

export function getSequence(id: string): Sequence | undefined {
  return SEQUENCES.find((s) => s.id === id);
}
