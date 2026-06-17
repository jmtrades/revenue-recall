/**
 * "Go Live" command center — the single source of truth for whether the AI can
 * actually call your leads, and what's blocking it. The capability is real but
 * gated behind several switches that were previously invisible (telephony,
 * voice, brain, consent, plan, sending pause, an enabled task, a running
 * schedule). This turns each gate into a plain-language step with a three-state
 * status and the exact next action. Pure + tested; the page feeds it live signals.
 */

export type GoLiveState = "live" | "attention" | "off";

export interface GoLiveStep {
  key: string;
  title: string;
  /** Human, computed sentence — what's true now and why it matters. */
  detail: string;
  state: GoLiveState;
  action?: { label: string; href: string };
}

export interface GoLiveSignals {
  /** A real telephony transport resolves (Twilio / gateway / webhook). */
  phoneConnected: boolean;
  /** Gateway /health ping: true reachable, false unreachable, null = no gateway URL (direct Twilio). */
  gatewayReachable: boolean | null;
  /** Gateway URL points at the app, not the call-gateway (classic misconfig). */
  gatewayMisdirected: boolean;
  /** A house/cloned voice is selected. */
  voiceReady: boolean;
  /** The conversation brain (Anthropic) is configured. */
  brainReady: boolean;
  leadCount: number;
  /** Leads carrying a call-consent marker (the agent may only auto-call these). */
  consentCount: number;
  /** Plan includes autonomous calling. */
  autopilotEntitled: boolean;
  /** Org has paused all outbound. */
  sendingPaused: boolean;
  /** Enabled autopilot tasks set to call autonomously. */
  enabledAutoTasks: number;
  /** Most recent autopilot run (proves the schedule is firing), ISO or null. */
  lastRunAt: string | null;
  now: string;
}

export interface GoLiveStatus {
  steps: GoLiveStep[];
  /** A rep can place a REAL manual call right now. */
  liveForManualCalls: boolean;
  /** The autopilot can place REAL autonomous calls right now. */
  liveForAutonomousCalls: boolean;
  readyCount: number;
  total: number;
  /** First step needing attention/off — where to send the user next. */
  nextHref: string | null;
}

/** Autopilot run within this many hours = the schedule is live. */
const SCHEDULE_FRESH_HOURS = 26;

export function goLiveStatus(s: GoLiveSignals): GoLiveStatus {
  // Telephony is the foundation: connected, not misdirected, and reachable when
  // a gateway URL is in play (null = direct Twilio, which needs no health ping).
  const phoneOk = s.phoneConnected && !s.gatewayMisdirected && s.gatewayReachable !== false;
  const phoneDetail = !s.phoneConnected
    ? "No phone line connected — calls are logged to the timeline, not dialed. Connect a number to dial for real."
    : s.gatewayMisdirected
      ? "Phone line set, but the call-gateway URL points at the app. Fix VOICE_WEBHOOK_URL to the gateway."
      : s.gatewayReachable === false
        ? "Phone line set, but the call-gateway isn't responding. Calls won't connect until it's back."
        : "Connected — calls dial out for real.";

  const consentDetail =
    s.leadCount === 0
      ? "No leads yet — import your list so there's someone to call."
      : s.consentCount === 0
        ? `0 of ${s.leadCount} leads cleared to call — so the agent is currently skipping all of them. In Leads, select the contacts you have permission to call and click "Record call consent".`
        : `${s.consentCount} of ${s.leadCount} lead${s.leadCount === 1 ? "" : "s"} cleared to call. The agent only auto-calls leads with recorded consent.`;

  const scheduleFresh =
    s.lastRunAt != null &&
    s.enabledAutoTasks > 0 &&
    Date.parse(s.now) - Date.parse(s.lastRunAt) <= SCHEDULE_FRESH_HOURS * 3_600_000;

  const steps: GoLiveStep[] = [
    {
      key: "phone",
      title: "Phone line",
      detail: phoneDetail,
      state: phoneOk ? "live" : s.phoneConnected ? "attention" : "off",
      action: { label: "Calling settings", href: "/settings#calling" },
    },
    {
      key: "voice",
      title: "AI voice",
      detail: s.voiceReady ? "A voice is set — calls and read-alouds sound like you." : "No voice selected — pick the voice your calls speak in.",
      state: s.voiceReady ? "live" : "off",
      action: { label: "Choose a voice", href: "/settings#voice" },
    },
    {
      key: "brain",
      title: "Conversation engine",
      detail: s.brainReady ? "The AI brain is connected — it can hold a real conversation." : "The conversation engine isn't connected yet.",
      state: s.brainReady ? "live" : "off",
      action: { label: "Calling settings", href: "/settings#calling" },
    },
    {
      key: "leads",
      title: "Your leads",
      detail: s.leadCount > 0 ? `${s.leadCount} lead${s.leadCount === 1 ? "" : "s"} in your list.` : "No leads yet — import the cold list you want revived.",
      state: s.leadCount > 0 ? "live" : "off",
      action: { label: "Import leads", href: "/leads" },
    },
    {
      key: "consent",
      title: "Call consent",
      detail: consentDetail,
      state: s.consentCount > 0 ? "live" : s.leadCount > 0 ? "attention" : "off",
      action: { label: "Record consent in Leads", href: "/leads" },
    },
    {
      key: "plan",
      title: "Autopilot plan",
      detail: s.autopilotEntitled ? "Your plan includes autonomous calling." : "Autonomous calling isn't on your plan yet — calls are held for review instead.",
      state: s.autopilotEntitled ? "live" : "off",
      action: { label: "View plans", href: "/settings#billing" },
    },
    {
      key: "sending",
      title: "Sending",
      detail: s.sendingPaused ? "Outbound is PAUSED — nothing sends or dials until you resume." : "Outbound is on.",
      state: s.sendingPaused ? "attention" : "live",
      action: { label: "Sending settings", href: "/settings#sending" },
    },
    {
      key: "task",
      title: "Autopilot task",
      detail: s.enabledAutoTasks > 0 ? `${s.enabledAutoTasks} autonomous task${s.enabledAutoTasks === 1 ? "" : "s"} active.` : "No autonomous task is running. Turn one on to let the agent work your list.",
      state: s.enabledAutoTasks > 0 ? "live" : "off",
      action: { label: "Set up autopilot", href: "/agents" },
    },
    {
      key: "schedule",
      title: "Schedule",
      detail: scheduleFresh
        ? "The agent is running on schedule."
        : s.enabledAutoTasks > 0
          ? "A task is enabled but hasn't run recently — the scheduler may not be firing."
          : "The schedule starts once an autonomous task is active.",
      state: scheduleFresh ? "live" : s.enabledAutoTasks > 0 ? "attention" : "off",
      action: { label: "View autopilot", href: "/agents" },
    },
  ];

  const liveForManualCalls = phoneOk && s.brainReady;
  const liveForAutonomousCalls =
    liveForManualCalls &&
    s.voiceReady &&
    s.autopilotEntitled &&
    !s.sendingPaused &&
    s.enabledAutoTasks > 0 &&
    s.consentCount > 0;

  const readyCount = steps.filter((x) => x.state === "live").length;
  const next = steps.find((x) => x.state !== "live");

  return {
    steps,
    liveForManualCalls,
    liveForAutonomousCalls,
    readyCount,
    total: steps.length,
    nextHref: next?.action?.href ?? null,
  };
}
