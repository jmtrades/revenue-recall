/**
 * Outreach sequences (cadences). Multi-step, multi-channel follow-up plans.
 * Shipped as templates so any industry has a working cadence on day one; these
 * map onto a CRM's tasks/workflows when one is connected.
 */

export type SeqChannel = "call" | "email" | "sms";

export interface SequenceStep {
  day: number;
  channel: SeqChannel;
  subject: string;
  body: string;
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
      { day: 0, channel: "email", subject: "Still worth a conversation?", body: "Quick check-in — circumstances change. Is now a better time to revisit this?" },
      { day: 3, channel: "call", subject: "Call attempt", body: "Reference the original goal; lead with a new angle or incentive." },
      { day: 7, channel: "sms", subject: "Soft nudge", body: "No pressure — happy to close the loop either way. Want me to send over options?" },
      { day: 14, channel: "email", subject: "Closing the file", body: "Last note before I archive this. Reply 'open' to keep it active." },
    ],
  },
  {
    id: "new_lead",
    name: "New Lead Speed-to-Lead",
    goal: "Reach a fresh inbound lead within minutes and book the next step.",
    industries: ["*"],
    steps: [
      { day: 0, channel: "call", subject: "Immediate call", body: "Call within 5 minutes of the lead arriving. Confirm need and timeline." },
      { day: 0, channel: "sms", subject: "Text follow-up", body: "Tried to reach you — when's a good time today? Here to help." },
      { day: 1, channel: "email", subject: "Next steps", body: "Recap what they're looking for and propose a concrete next step." },
    ],
  },
  {
    id: "real_estate_listing",
    name: "Listing Appointment",
    goal: "Convert a seller lead into a signed listing.",
    industries: ["real_estate"],
    steps: [
      { day: 0, channel: "call", subject: "Intro call", body: "Understand motivation, timeline, and the property." },
      { day: 1, channel: "email", subject: "Your home's value", body: "Send a tailored CMA and a clear next step to meet." },
      { day: 4, channel: "sms", subject: "Walkthrough?", body: "Happy to swing by this week — what day works?" },
    ],
  },
  {
    id: "post_demo",
    name: "Post-Demo Follow-up",
    goal: "Keep momentum after a demo or showing through to a decision.",
    industries: ["saas", "agency", "auto", "home_services"],
    steps: [
      { day: 0, channel: "email", subject: "Thanks + recap", body: "Summarize value shown, attach proposal, propose a decision date." },
      { day: 2, channel: "call", subject: "Questions?", body: "Surface objections and align on remaining steps." },
      { day: 5, channel: "email", subject: "Anything blocking?", body: "Offer to loop in stakeholders or adjust scope." },
    ],
  },
];

export function sequencesFor(industryId: string): Sequence[] {
  return SEQUENCES.filter((s) => s.industries.includes("*") || s.industries.includes(industryId));
}
