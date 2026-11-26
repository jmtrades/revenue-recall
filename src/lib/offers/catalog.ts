/** The five jobs the ads sell, and the three offers that start them. */

export const JOBS = [
  { id: "speed_to_lead", label: "Speed to lead" },
  { id: "follow_up", label: "Follow-up" },
  { id: "triage", label: "Triage" },
  { id: "no_show", label: "No-show recovery" },
  { id: "reactivation", label: "Reactivation" },
] as const;

export type JobId = (typeof JOBS)[number]["id"];

export type OfferId = "setter-demo" | "reactivation-audit" | "build-call";

export interface Offer {
  id: OfferId;
  label: string;
  source: string;
  path: string;
}

export const OFFERS: Record<OfferId, Offer> = {
  "setter-demo": {
    id: "setter-demo",
    label: "Free AI setter demo",
    source: "offer:setter-demo",
    path: "/setter-demo",
  },
  "reactivation-audit": {
    id: "reactivation-audit",
    label: "Free dead-lead reactivation audit",
    source: "offer:reactivation-audit",
    path: "/reactivation-audit",
  },
  "build-call": {
    id: "build-call",
    label: "15-min AI setting team build call",
    source: "offer:build-call",
    path: "/build-call",
  },
};

/** These inboxes must never receive a message from this product. */
const BLOCKED_EMAILS = new Set(["jmtrades1990@gmail.com", "juniorcontentai@gmail.com"]);

export function blockedEmail(email: string | undefined): boolean {
  return BLOCKED_EMAILS.has((email ?? "").trim().toLowerCase());
}

export function offerFromHint(hint: string | undefined): OfferId {
  const text = (hint ?? "").toLowerCase();
  if (/reactivat|dead|old lead|audit/.test(text)) return "reactivation-audit";
  if (/build|15/.test(text)) return "build-call";
  return "setter-demo";
}
