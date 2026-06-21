/**
 * The product knowledge that grounds the in-app help assistant. ONE source of
 * truth, used two ways:
 *   1. `HELP_SYSTEM_PROMPT` steers the live AI answer (api/help/chat) so it
 *      speaks only from real product facts, not the model's imagination.
 *   2. `fallbackAnswer()` is the deterministic, no-AI reply — so the assistant
 *      still answers the common questions on a deploy with no ANTHROPIC_API_KEY,
 *      or once the monthly AI budget is spent. (Inert-without-config: the help
 *      widget degrades to a curated answer, never an error.)
 *
 * Guardrails baked in (these mirror the product's own rules — see CLAUDE.md):
 *  - No fabricated stats, prices, or guarantees. If a fact isn't here, say so.
 *  - White-labeled voice: the calling voice is "a natural, human-sounding AI
 *    voice" — never name the underlying vendor.
 *  - Pricing is framed as value/abundance, never as divisible unit counts
 *    ("works your whole list", not "X minutes" / "Y messages").
 */

export interface HelpTopic {
  id: string;
  /** Words that, if present in a question, point at this topic. */
  keywords: string[];
  /** A short, self-contained answer used as the no-AI fallback. */
  answer: string;
}

/** The recall-worthy, plain-English facts. Kept tight so it fits one system
 *  prompt cheaply and so the fallback answers stay accurate. */
export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "start-calling",
    keywords: ["call", "calling", "dial", "dialer", "phone", "ring", "voice call", "make a call", "cold call"],
    answer:
      "There are three ways to start calling:\n\n" +
      "1. Power Dialer (the fastest) — open Power Dialer in the left sidebar (under “Work”). It lines up your leads who have a phone number — cold and slipping deals first — for back-to-back calling, with an AI prep brief on each one and outcomes auto-logged. Press C to call, 1/2/3 to log an outcome, N for the next lead.\n" +
      "2. Call now on any deal — open a deal (or the Revenue Recall queue) and click “Call now.” The AI places the call in a natural, human-sounding voice and logs the transcript to the timeline.\n" +
      "3. Let Autopilot do it — turn on Autopilot and it calls (and emails/texts) on its own as part of a sequence, within your rules.\n\n" +
      "For a call to connect you need: a contact with a phone number, a paid plan (or you're the operator), and the call must pass the compliance checks (consent + local quiet hours).",
  },
  {
    id: "calling-requirements",
    keywords: ["can't call", "cant call", "call not working", "out of minutes", "402", "consent", "quiet hours", "why can't i call"],
    answer:
      "If a call won't go through, it's almost always one of these:\n" +
      "• The contact has no phone number on file.\n" +
      "• You're on the free plan — live calling is a paid feature (the operator account is always allowed).\n" +
      "• Compliance hold — calls are consent-gated and only dial inside local calling hours, and never to someone who opted out. This is by design and can't be bypassed.\n" +
      "• The voice service isn't connected yet on a self-hosted deploy. Check Go Live for setup status.",
  },
  {
    id: "voice-setup",
    keywords: ["voice", "my voice", "clone", "speak", "read aloud", "accent", "sound", "tts"],
    answer:
      "Teach it your voice in Settings → Voice. You can pick a house voice and tune the speaking speed and expressiveness, so every email, text, and call sounds like you instead of a bot. The same voice powers read-aloud on briefs and drafts and the live calling voice.",
  },
  {
    id: "recall",
    keywords: ["recall", "cold lead", "dead lead", "revive", "slipping", "at risk", "recover", "lost deal", "going cold"],
    answer:
      "Revenue Recall (in the sidebar) is the heart of the product: it scores every deal going cold, stalled, or marked lost-but-winnable, ranks them by how much recoverable revenue is at stake, and works them back to life across email, SMS, and the phone. Open the queue and work the top items, or hand them to Autopilot.",
  },
  {
    id: "autopilot",
    keywords: ["autopilot", "automatic", "automation", "sequence", "hands off", "auto", "by itself", "on its own"],
    answer:
      "Autopilot runs outbound end to end — it decides who to contact and when, writes in your voice, sends, calls, and follows up until they reply, then logs everything. You choose how much rope: draft-for-approval (you approve each send), scheduled, or fully autonomous. Set it up under Autopilot / Sequences in the sidebar.",
  },
  {
    id: "approvals",
    keywords: ["approve", "approval", "review", "draft", "before sending", "queue"],
    answer:
      "If you'd rather check the AI's work before anything goes out, set Autopilot to draft-for-approval. Drafts land in Approvals (in the sidebar) where you can edit, approve, or skip each one. Approve and it sends in your voice.",
  },
  {
    id: "import",
    keywords: ["import", "csv", "upload", "add leads", "spreadsheet", "contacts", "data in", "bring in"],
    answer:
      "Bring your leads in under Settings → Import: drop in a CSV from any source and the columns are auto-mapped, with duplicates skipped. Already on a CRM, spreadsheet, or database? Connect it under Settings → Integrations and Revenue Recall runs on top — no migration. Or add a contact and deal by hand from Leads.",
  },
  {
    id: "integrations",
    keywords: ["integration", "crm", "connect", "hubspot", "salesforce", "close", "sync", "calendar", "email account"],
    answer:
      "Connect your existing tools under Settings → Integrations — your CRM, calendar, and email/phone providers. The product is provider-agnostic and works with any CRM, or none at all. Once connected, your deals and activity sync and the AI works on top of your real data.",
  },
  {
    id: "billing",
    keywords: ["price", "pricing", "cost", "plan", "billing", "upgrade", "subscribe", "pay", "free", "trial", "money", "card", "stripe", "cancel", "refund"],
    answer:
      "You can start free — no card — with template-based outreach. Upgrading turns on live AI that works your whole list autonomously across email, SMS, and the phone. Calls are economical: you only pay when a call actually connects (no-answers are free). You can add capacity any time, and cancel whenever — your data is always exportable. See the Pricing page or Settings → Billing for current plans.",
  },
  {
    id: "compliance",
    keywords: ["compliance", "tcpa", "legal", "opt out", "unsubscribe", "stop", "consent", "spam", "regulation", "a2p", "quiet hours"],
    answer:
      "Compliance is built in and load-bearing. Texts include opt-out (STOP) handling and emails carry an unsubscribe link. Calls and messages only go out inside local calling hours and never to someone who opted out, and autonomous calls are consent-gated. These protections are on by design and can't be switched off.",
  },
  {
    id: "go-live",
    keywords: ["go live", "launch", "setup", "get started", "onboard", "begin", "first", "activate", "ready"],
    answer:
      "Open Go Live (top of the sidebar) for the launch checklist — it walks you through bringing in leads, teaching the AI your voice, connecting your tools, and turning on outreach. The Dashboard also shows an activation checklist until setup is complete. Start by importing leads, then teach it your voice, then make your first call from the Power Dialer.",
  },
  {
    id: "reports",
    keywords: ["report", "metrics", "analytics", "performance", "results", "leaderboard", "forecast", "won back", "roi"],
    answer:
      "Reports (in the sidebar) shows what the system actually recovered — won-back revenue, reply rates, meetings booked, and per-rep performance — not vanity metrics. The Dashboard gives you the at-a-glance version, including recoverable revenue and your dials today.",
  },
  {
    id: "what-is",
    keywords: ["what is", "what does", "about", "explain", "how does this work", "what can you do", "overview", "revenue recall"],
    answer:
      "Revenue Recall is an autonomous AI sales force. It runs your outbound end to end — finds the deals slipping away, works them across email, SMS, and the phone in your own voice, follows up until they reply, and recovers revenue you're losing. It works for any industry, with any CRM or none. Ask me how to start calling, import leads, or turn on Autopilot.",
  },
];

/**
 * The single grounding block for the live AI assistant. Reads as instructions +
 * a compact knowledge base assembled from the topics above, so the facts never
 * drift between the AI answer and the fallback.
 */
export const HELP_SYSTEM_PROMPT = [
  "You are the in-product help assistant for Revenue Recall (recall-touch.com), an autonomous AI sales platform.",
  "Your job: answer questions about how the product works and how to do things in it — clearly, briefly, and accurately.",
  "",
  "STYLE: Warm, direct, and concise. Prefer 2–5 sentences or a short numbered list. Name the exact place in the app to click (e.g. “Power Dialer in the left sidebar”, “Settings → Voice”). Use plain language a non-technical salesperson understands.",
  "",
  "HARD RULES (never break these):",
  "• Only state facts that are in the knowledge below or are obviously general. If you don't know, say you're not sure and point them to Go Live or support — never invent features, prices, numbers, or guarantees.",
  "• The calling voice is “a natural, human-sounding AI voice.” Never name the underlying voice/telephony/AI vendors.",
  "• Talk about plans as value and abundance (“works your whole list”, “add capacity any time”). Never quote specific included minute/message counts or do per-unit math — point to the Pricing page for exact, current numbers.",
  "• Never claim specific results, ROI, or statistics. No “users see X%” style claims.",
  "• Compliance (consent, local calling hours, STOP/opt-out) is built in and cannot be disabled — never suggest a way around it.",
  "• Stay on the topic of using Revenue Recall. If asked something unrelated, gently steer back.",
  "",
  "PRODUCT KNOWLEDGE:",
  ...HELP_TOPICS.map((t) => `• ${t.answer.replace(/\n+/g, " ")}`),
].join("\n");

/** Friendly starter prompts shown as chips in the widget. */
export const SUGGESTED_QUESTIONS = [
  "How do I start calling?",
  "How do I import my leads?",
  "What does Autopilot do?",
  "How does billing work?",
];

/** The greeting the assistant opens with. */
export const HELP_GREETING =
  "Hi! I'm your Revenue Recall assistant. Ask me anything — how to start calling, import leads, set up your voice, billing, and more.";

const DEFAULT_ANSWER =
  "I can help you use Revenue Recall — try asking how to start calling, how to import your leads, how to set up your voice, how Autopilot works, or how billing works. To get going end to end, open Go Live at the top of the left sidebar for the launch checklist.";

/**
 * Deterministic best-match answer for the no-AI path. Scores each topic by how
 * many of its keywords appear in the question and returns the best one (or a
 * helpful default). Lower-cased, punctuation-insensitive matching.
 */
export function fallbackAnswer(question: string): string {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9\s]/g, " ")} `;
  let best: HelpTopic | null = null;
  let bestScore = 0;
  for (const topic of HELP_TOPICS) {
    let score = 0;
    for (const kw of topic.keywords) {
      if (q.includes(` ${kw} `) || q.includes(`${kw} `) || q.includes(` ${kw}`)) score += kw.includes(" ") ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }
  return best ? best.answer : DEFAULT_ANSWER;
}
