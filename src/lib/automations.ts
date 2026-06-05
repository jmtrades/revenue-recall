/**
 * Automation rule templates: when a trigger fires, run actions. Shipped as a
 * starter library so any org has useful automations on day one. These map onto
 * a CRM's native workflow engine when one is connected.
 */

export type TriggerKind = "lead_created" | "stage_changed" | "deal_idle" | "deal_won" | "deal_lost" | "form_submitted";

export interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: { kind: TriggerKind; label: string };
  actions: string[];
  /** Whether enabled by default. */
  enabled: boolean;
  /** Industry ids; "*" = universal. */
  industries: string[];
}

export const AUTOMATIONS: Automation[] = [
  {
    id: "speed_to_lead",
    name: "Speed-to-Lead",
    description: "Instantly engage new leads so none go cold before first contact.",
    trigger: { kind: "lead_created", label: "When a lead is created" },
    actions: ["Assign to the on-duty rep", "Create a 'Call now' task", "Send the intro SMS template", "Start the 'New Lead Speed-to-Lead' sequence"],
    enabled: true,
    industries: ["*"],
  },
  {
    id: "idle_recall",
    name: "Auto-Recall Idle Deals",
    description: "Catch deals before they slip — the engine flags inactivity and reactivates them.",
    trigger: { kind: "deal_idle", label: "When a deal has no activity for 14 days" },
    actions: ["Add to the Revenue Recall queue", "Notify the deal owner", "Start the 'Revenue Recall' sequence"],
    enabled: true,
    industries: ["*"],
  },
  {
    id: "stage_handoff",
    name: "Stage Handoff Tasks",
    description: "Generate the right next step every time a deal advances.",
    trigger: { kind: "stage_changed", label: "When a deal changes stage" },
    actions: ["Create the stage's checklist tasks", "Update the expected close date", "Post an update to the team channel"],
    enabled: true,
    industries: ["*"],
  },
  {
    id: "won_onboarding",
    name: "Won → Onboarding",
    description: "Turn a win into a smooth start and ask for a referral.",
    trigger: { kind: "deal_won", label: "When a deal is marked won" },
    actions: ["Send the welcome email", "Create onboarding tasks", "Schedule a 30-day check-in", "Request a review/referral"],
    enabled: false,
    industries: ["*"],
  },
  {
    id: "lost_winback",
    name: "Lost Deal Win-Back",
    description: "Keep lost deals warm for a future second chance.",
    trigger: { kind: "deal_lost", label: "When a deal is marked lost" },
    actions: ["Tag with the loss reason", "Enroll in a 90-day nurture", "Create a follow-up task for next quarter"],
    enabled: false,
    industries: ["*"],
  },
  {
    id: "listing_alert",
    name: "New Listing Match Alert",
    description: "Notify buyers the moment a matching property hits the market.",
    trigger: { kind: "form_submitted", label: "When a new listing matches buyer criteria" },
    actions: ["Match against active buyers", "Send the listing via SMS + email", "Create a showing task"],
    enabled: false,
    industries: ["real_estate"],
  },
];

export function automationsFor(industryId: string): Automation[] {
  return AUTOMATIONS.filter((a) => a.industries.includes("*") || a.industries.includes(industryId));
}

/** Automations for an industry with the org's saved enable overrides applied, so
 *  the page reflects (and persists) what the org actually turned on/off. */
export function effectiveAutomations(industryId: string, overrides: Record<string, boolean> | undefined): Automation[] {
  return automationsFor(industryId).map((a) => ({ ...a, enabled: overrides?.[a.id] ?? a.enabled }));
}

/** Is an automation on for an org? Its saved override wins; otherwise the
 *  template default. Used by the engine so a toggle is a real master switch. */
export function isAutomationEnabled(id: string, overrides: Record<string, boolean> | undefined): boolean {
  const o = overrides?.[id];
  if (typeof o === "boolean") return o;
  return AUTOMATIONS.find((a) => a.id === id)?.enabled ?? false;
}
