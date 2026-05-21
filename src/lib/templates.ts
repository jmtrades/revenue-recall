/**
 * Email & SMS template library. Merge tokens like {{first_name}} are resolved
 * at send time. Shipped per-industry so reps never start from a blank page.
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
  {
    id: "intro_email",
    name: "Intro & Overview",
    channel: "email",
    category: "Prospecting",
    subject: "Quick intro, {{first_name}}",
    body: "Hi {{first_name}},\n\nThanks for reaching out about {{interest}}. I'd love to learn a bit more about what you're looking for and share how we can help.\n\nDo you have 15 minutes this week? Here's my calendar: {{booking_link}}\n\nBest,\n{{my_name}}",
    industries: ["*"],
  },
  {
    id: "intro_sms",
    name: "Speed-to-Lead Text",
    channel: "sms",
    category: "Prospecting",
    body: "Hi {{first_name}}, it's {{my_name}} from {{company}} — saw your inquiry about {{interest}}. When's a good time for a quick call today?",
    industries: ["*"],
  },
  {
    id: "followup_email",
    name: "Follow-Up After No Reply",
    channel: "email",
    category: "Follow-up",
    subject: "Still the right time, {{first_name}}?",
    body: "Hi {{first_name}},\n\nCircling back on my last note — totally understand timing can shift. Are you still exploring {{interest}}?\n\nHappy to send over options or answer any questions.\n\n{{my_name}}",
    industries: ["*"],
  },
  {
    id: "recall_email",
    name: "Revenue Recall Re-Engage",
    channel: "email",
    category: "Recall",
    subject: "Worth revisiting?",
    body: "Hi {{first_name}},\n\nIt's been a little while. A lot can change — if {{interest}} is back on your radar, I'd be glad to pick up where we left off, no pressure.\n\nWant me to send a fresh proposal?\n\n{{my_name}}",
    industries: ["*"],
  },
  {
    id: "proposal_email",
    name: "Proposal Sent",
    channel: "email",
    category: "Closing",
    subject: "Your proposal, {{first_name}}",
    body: "Hi {{first_name}},\n\nAttached is the proposal we discussed. Highlights:\n• {{point_1}}\n• {{point_2}}\n\nI'd suggest we aim to decide by {{decision_date}}. Happy to hop on a call to walk through it.\n\n{{my_name}}",
    industries: ["*"],
  },
  {
    id: "cma_email",
    name: "Home Value (CMA)",
    channel: "email",
    category: "Real Estate",
    subject: "What your home is worth, {{first_name}}",
    body: "Hi {{first_name}},\n\nI put together a comparative market analysis for {{address}}. Based on recent sales nearby, your estimated range is {{price_range}}.\n\nWant to meet this week to talk strategy?\n\n{{my_name}}",
    industries: ["real_estate"],
  },
  {
    id: "showing_sms",
    name: "Showing Confirmation",
    channel: "sms",
    category: "Real Estate",
    body: "Hi {{first_name}}, confirming our showing at {{address}} on {{date}} at {{time}}. Reply YES to confirm or let me know if you need to reschedule!",
    industries: ["real_estate"],
  },
];

export function templatesFor(industryId: string): MessageTemplate[] {
  return TEMPLATES.filter((t) => t.industries.includes("*") || t.industries.includes(industryId));
}
