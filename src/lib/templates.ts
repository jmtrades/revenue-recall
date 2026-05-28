/**
 * Email & SMS template library. Merge tokens like {{first_name}} are resolved
 * at send time. Shipped per-industry so reps never start from a blank page.
 *
 * Every template is written to read like a real person wrote it — no AI tells,
 * no mail-merge clichés. The test suite enforces this (see human-voice.test.ts).
 */

export type TemplateChannel = "email" | "sms";

export interface MessageTemplate {
  id: string;
  name: string;
  channel: TemplateChannel;
  category: string;
  subject?: string;
  body: string;
  industries: string[];
}

export const TEMPLATES: MessageTemplate[] = [
  // ---- Universal ----
  {
    id: "intro_email",
    name: "Intro & Overview",
    channel: "email",
    category: "Prospecting",
    subject: "quick intro, {{first_name}}",
    body: "Hi {{first_name}},\n\nThanks for the note about {{interest}}. I'd rather actually help than add to your inbox — so what's the main thing you're trying to figure out?\n\nIf it's easier to just talk, grab whatever time works: {{booking_link}}\n\n{{my_name}}",
    industries: ["*"],
  },
  {
    id: "intro_sms",
    name: "Speed-to-Lead Text",
    channel: "sms",
    category: "Prospecting",
    body: "hi {{first_name}}, it's {{my_name}} from {{company}} — saw your note about {{interest}}. got a couple minutes today, or is tomorrow better?",
    industries: ["*"],
  },
  {
    id: "followup_email",
    name: "Follow-Up After No Reply",
    channel: "email",
    category: "Follow-up",
    subject: "still the right time, {{first_name}}?",
    body: "Hi {{first_name}},\n\nNo reply's completely fine. I just want to know whether {{interest}} is still something you're working on or if it's dropped down the list.\n\nEither answer helps me figure out whether to keep sending things your way. Where's it at?\n\n{{my_name}}",
    industries: ["*"],
  },
  {
    id: "recall_email",
    name: "Revenue Recall Re-Engage",
    channel: "email",
    category: "Recall",
    subject: "worth picking back up?",
    body: "Hi {{first_name}},\n\nIt's been a bit. Things change, so I'll just ask straight: is {{interest}} back on your radar, or should I let it go for now?\n\nIf it's live again, I can pick up right where we left off — no starting over.\n\n{{my_name}}",
    industries: ["*"],
  },
  {
    id: "proposal_email",
    name: "Proposal Sent",
    channel: "email",
    category: "Closing",
    subject: "your proposal, {{first_name}}",
    body: "Hi {{first_name}},\n\nHere's the proposal we talked through. The parts that matter most:\n• {{point_1}}\n• {{point_2}}\n\nHappy to walk you through it on a quick call — otherwise, what do you think? Having an answer by {{decision_date}} keeps everything on track.\n\n{{my_name}}",
    industries: ["*"],
  },

  // ---- Real Estate ----
  {
    id: "cma_email",
    name: "Home Value (CMA)",
    channel: "email",
    category: "Real Estate",
    subject: "what your place is worth, {{first_name}}",
    body: "Hi {{first_name}},\n\nPulled together a market analysis for {{address}}. Based on what's actually sold nearby, you're sitting around {{price_range}} — a bit more than most owners expect right now.\n\nWant to grab coffee this week and talk through what that means if you decide to sell?\n\n{{my_name}}",
    industries: ["real_estate"],
  },
  {
    id: "showing_sms",
    name: "Showing Confirmation",
    channel: "sms",
    category: "Real Estate",
    body: "hi {{first_name}}, confirming our showing at {{address}} on {{date}} at {{time}}. reply YES to lock it in, or tell me if you need a different time.",
    industries: ["real_estate"],
  },
  {
    id: "new_listing_sms",
    name: "New Listing Alert",
    channel: "sms",
    category: "Real Estate",
    body: "hey {{first_name}} — new one just came on near {{area}} that fits what you wanted. want me to grab you a showing before the weekend rush?",
    industries: ["real_estate"],
  },

  // ---- Mortgage & Lending ----
  {
    id: "rate_update_sms",
    name: "Rate Update",
    channel: "sms",
    category: "Mortgage",
    body: "hey {{first_name}}, rates moved this week — want me to re-run your numbers? takes me 10 min and it might be worth it.",
    industries: ["mortgage"],
  },
  {
    id: "preapproval_email",
    name: "Get Pre-Approved",
    channel: "email",
    category: "Mortgage",
    subject: "let's get you pre-approved, {{first_name}}",
    body: "Hi {{first_name}},\n\nIf you're out looking, getting pre-approved first makes your offers a lot stronger — sellers take them more seriously.\n\nI can turn a letter around fast; I'd just need a few basics from you. Want me to send the short list?\n\n{{my_name}}",
    industries: ["mortgage"],
  },

  // ---- Insurance ----
  {
    id: "renewal_email",
    name: "Renewal Review",
    channel: "email",
    category: "Insurance",
    subject: "your renewal's coming up, {{first_name}}",
    body: "Hi {{first_name}},\n\nYour policy renews {{renewal_date}}. Before it auto-renews, want me to shop it and make sure you're not overpaying? Coverage and rates shift year to year.\n\nTakes me a few minutes, and there's no obligation either way.\n\n{{my_name}}",
    industries: ["insurance"],
  },
  {
    id: "coverage_review_sms",
    name: "Coverage Check",
    channel: "sms",
    category: "Insurance",
    body: "hi {{first_name}}, quick one — want me to run a fast coverage check before your renewal? want to make sure you're covered right and not paying too much.",
    industries: ["insurance"],
  },

  // ---- SaaS / B2B ----
  {
    id: "trial_ending_email",
    name: "Trial Wrap-Up",
    channel: "email",
    category: "SaaS",
    subject: "how'd the trial go, {{first_name}}?",
    body: "Hi {{first_name}},\n\nYour trial wraps up {{trial_end}}. Did the team get enough out of it to make a call?\n\nIf there are open questions, happy to jump on 15 minutes. And if you need more runway to test it properly, I can extend it — just say the word.\n\n{{my_name}}",
    industries: ["saas"],
  },
  {
    id: "roi_email",
    name: "ROI for Finance",
    channel: "email",
    category: "SaaS",
    subject: "the numbers for your team, {{first_name}}",
    body: "Hi {{first_name}},\n\nPut together a quick breakdown of what {{company}} would actually save — the kind of thing finance wants to see before a yes.\n\nWant me to send it over, or should we walk through it together?\n\n{{my_name}}",
    industries: ["saas", "agency"],
  },

  // ---- Agency / Services ----
  {
    id: "scope_email",
    name: "Phase the Scope",
    channel: "email",
    category: "Agency",
    subject: "tightening the scope, {{first_name}}",
    body: "Hi {{first_name}},\n\nIf budget's the holdup on the {{service}} project, we don't have to do it all at once. I can phase it so you start with the part that moves the needle and scale from there.\n\nWant me to put a phased option together?\n\n{{my_name}}",
    industries: ["agency"],
  },

  // ---- Automotive ----
  {
    id: "hold_vehicle_sms",
    name: "Hold the Vehicle",
    channel: "sms",
    category: "Automotive",
    body: "hey {{first_name}}, the {{vehicle}} you liked is still here but it's getting attention. want me to hold it for you til {{date}}?",
    industries: ["auto"],
  },
  {
    id: "incentive_email",
    name: "New Incentives",
    channel: "email",
    category: "Automotive",
    subject: "your payment just dropped, {{first_name}}",
    body: "Hi {{first_name}},\n\nIncentives changed this month, which means the {{vehicle}} we talked about just got more affordable. Happy to run the new numbers with your trade-in.\n\nWant me to do that, or come take it for another spin first?\n\n{{my_name}}",
    industries: ["auto"],
  },

  // ---- Home Services ----
  {
    id: "estimate_followup_sms",
    name: "Estimate Follow-Up",
    channel: "sms",
    category: "Home Services",
    body: "hi {{first_name}}, still want us out to look at the {{job_type}}? can get a tech there this week — just need a day that works for you.",
    industries: ["home_services"],
  },
  {
    id: "schedule_email",
    name: "Get on the Schedule",
    channel: "email",
    category: "Home Services",
    subject: "ready to get you on the schedule, {{first_name}}",
    body: "Hi {{first_name}},\n\nYour estimate for the {{job_type}} is still good. If you're ready, I'd grab you a spot before the calendar fills up — this time of year it goes fast.\n\nWant me to lock something in?\n\n{{my_name}}",
    industries: ["home_services"],
  },
];

export function templatesFor(industryId: string): MessageTemplate[] {
  return TEMPLATES.filter((t) => t.industries.includes("*") || t.industries.includes(industryId));
}
