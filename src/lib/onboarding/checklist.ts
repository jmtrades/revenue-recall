/**
 * Post-onboarding activation checklist. The wizard gets a new user set up, but
 * after it they land on the dashboard with no guided path to the moment that
 * actually matters — their first recall touch. This derives the checklist purely
 * from existing workspace signals (no new persistence, no per-step flags to drift
 * out of sync): a step is "done" when its evidence exists. Pure + tested.
 */

export interface SetupSignals {
  /** Any contacts/leads in the workspace. */
  hasLeads: boolean;
  /** A house/cloned voice is selected for outreach. */
  voiceConfigured: boolean;
  /** At least one contact carries a call-consent marker (TCPA-load-bearing). */
  hasCallConsent: boolean;
  /** At least one recall touch has gone out — the activation moment. */
  hasRecallTouch: boolean;
}

export interface SetupStep {
  key: keyof SetupSignals;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

export interface SetupChecklist {
  steps: SetupStep[];
  doneCount: number;
  total: number;
  /** Every step satisfied — the caller hides the checklist. */
  complete: boolean;
  /** Where to send the user next (first incomplete step), or null when done. */
  nextHref: string | null;
}

const STEPS: ReadonlyArray<Omit<SetupStep, "done">> = [
  { key: "hasLeads", title: "Import your leads", description: "Bring in the cold and dead leads you want to revive — CSV, CRM, or add one by hand.", href: "/leads" },
  { key: "voiceConfigured", title: "Set your voice", description: "Pick the voice your outreach speaks in, so calls and read-alouds sound like you.", href: "/settings" },
  { key: "hasCallConsent", title: "Record call consent", description: "Mark which contacts you have consent to call — autonomous dialing is consent-gated.", href: "/leads" },
  { key: "hasRecallTouch", title: "Run your first recall touch", description: "Work the recall queue — the first re-engagement is where revenue starts coming back.", href: "/recall" },
];

export function setupChecklist(signals: SetupSignals): SetupChecklist {
  const steps: SetupStep[] = STEPS.map((s) => ({ ...s, done: signals[s.key] }));
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length,
    nextHref: next?.href ?? null,
  };
}
