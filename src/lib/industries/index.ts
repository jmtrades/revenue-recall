import type { Pipeline } from "@/lib/crm/types";
import { DEFAULT_RECALL_THRESHOLDS, type RecallThresholds } from "@/lib/recall/engine";

/**
 * Industry templates. Each industry remaps terminology and ships a default
 * pipeline so a brand-new user (with no CRM at all) gets a sensible sales
 * process on day one. New verticals are added by appending to INDUSTRIES.
 */

export interface IndustryTerminology {
  /** What a "lead/contact" is called (e.g. "Buyer", "Patient"). */
  contact: string;
  /** What an "opportunity/deal" is called (e.g. "Listing", "Policy"). */
  opportunity: string;
  /** The unit of value (e.g. "Commission", "Premium", "Contract value"). */
  value: string;
}

/**
 * How a real rep in this vertical actually talks. Drives both the AI prompt
 * (so live drafts are accurate to the industry) and the deterministic
 * fallbacks (so the no-API-key demo still reads like a human, not a template).
 */
export interface IndustryPlaybook {
  /** What the contact ultimately wants. */
  buyerGoal: string;
  /** What the rep does for them, in plain words. */
  repRole: string;
  /** Real objections people in this vertical actually voice. */
  objections: string[];
  /** Natural, human next-step asks, by channel. Phrased as a real rep would. */
  nextSteps: { email: string[]; sms: string[]; call: string[] };
  /** Human openers for re-engaging a cold or lost deal. */
  reengage: string[];
  /** A few example lines in a real rep's voice — style anchors for the AI. */
  sampleVoice: string[];
  /** Words and phrases native to this industry. */
  vocabulary: string[];
  /**
   * Industry-true handling for the core objection types. Each is a human reframe
   * that ends on a question, so a reply lands like a rep who knows this business —
   * not a generic script. Lowercase-initial so it composes for SMS; the email
   * path capitalizes it. TypeScript enforces all five on every industry.
   */
  objectionAngles: Record<ObjectionKind, string>;
}

/** The objection types the reply engine reframes (decline/question/positive aren't reframed). */
export type ObjectionKind = "price" | "timing" | "competitor" | "trust" | "info";

export interface IndustryTemplate {
  id: string;
  label: string;
  /** One-line description shown in the picker. */
  blurb: string;
  terminology: IndustryTerminology;
  /** Default currency for new orgs in this vertical. */
  currency: string;
  /** Default pipeline definition (ids are slugs, stable across reseeds). */
  pipeline: Omit<Pipeline, "id"> & { id: string };
  /** Industry-specific contact attributes surfaced in the UI. */
  fields: { key: string; label: string; type: "text" | "number" | "currency" | "date" | "select"; options?: string[] }[];
  /** How reps in this vertical communicate. */
  playbook: IndustryPlaybook;
  /** Sales-cycle-aware recall thresholds. Omitted fields fall back to defaults. */
  recall?: Partial<RecallThresholds>;
}

/** Resolve full recall thresholds for an industry, merging over the defaults. */
export function recallThresholdsFor(industryId: string): RecallThresholds {
  return { ...DEFAULT_RECALL_THRESHOLDS, ...getIndustry(industryId).recall };
}

function stages(
  defs: [id: string, label: string, prob: number, type?: "open" | "won" | "lost"][],
): Pipeline["stages"] {
  return defs.map(([id, label, probability, type]) => ({ id, label, probability, type: type ?? "open" }));
}

export const INDUSTRIES: IndustryTemplate[] = [
  {
    id: "real_estate",
    label: "Real Estate",
    blurb: "Agents & brokerages — buyers, sellers, listings and closings.",
    terminology: { contact: "Client", opportunity: "Deal", value: "Commission" },
    recall: { goingColdDays: 21, stalledDays: 45, lostWindowDays: 240 },
    currency: "USD",
    pipeline: {
      id: "real_estate_default",
      label: "Sales Pipeline",
      stages: stages([
        ["new_lead", "New Lead", 0.1],
        ["contacted", "Contacted", 0.2],
        ["nurture", "Nurturing", 0.3],
        ["showing", "Showing / Tour", 0.5],
        ["offer", "Offer Made", 0.7],
        ["under_contract", "Under Contract", 0.9],
        ["closed", "Closed", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "side", label: "Representing", type: "select", options: ["Buyer", "Seller", "Both"] },
      { key: "propertyType", label: "Property Type", type: "select", options: ["Single Family", "Condo", "Multi-Family", "Land", "Commercial"] },
      { key: "budget", label: "Budget", type: "currency" },
      { key: "area", label: "Target Area", type: "text" },
      { key: "preApproved", label: "Pre-Approved", type: "select", options: ["Yes", "No", "Unknown"] },
    ],
    playbook: {
      buyerGoal: "find or sell the right home on the right timeline — without overpaying or missing out",
      repRole: "their agent, who lines up showings, runs the numbers, and gets them to a clean close",
      objections: ["still just looking", "waiting for rates to come down", "want to see what else hits the market", "not sure it's the right time to sell", "the offer felt low", "we're going to relist with our old agent", "we're selling it ourselves — we don't want to pay a commission"],
      nextSteps: {
        email: ["want me to line up a few showings this weekend?", "happy to pull fresh comps for your place — want me to?", "should I send over the three that just came on near you?"],
        sms: ["want me to grab you a showing this weekend?", "free for a quick look this week?", "want the numbers on it before someone else jumps?"],
        call: ["Ask what's changed — timeline, budget, must-haves.", "Mention one or two specific listings that fit.", "Offer to line up showings for the weekend."],
      },
      reengage: ["saw a couple new listings near you and thought of you", "your search has been quiet lately — still looking, or did you land something?", "that place you liked came back on the market", "noticed your listing expired — happy to share my honest read on why it didn't move", "how are the showings going on your place? I've got a free buyer-net sheet if it's useful"],
      sampleVoice: [
        "hey jess — that 3br on maple came back on. want me to grab you a showing this weekend?",
        "morning! pulled fresh comps for your place and you've got more equity than you'd think. coffee this week to talk strategy?",
      ],
      vocabulary: ["showing", "listing", "comps", "offer", "closing", "pre-approval", "walkthrough", "under contract", "expired listing", "FSBO", "days on market", "net sheet", "open house", "relist"],
      objectionAngles: {
        price: "what a place actually sells for tracks the market more than the asking number, so what's the ceiling you don't want to cross?",
        timing: "the right home shows up when it's ready, not on a schedule, want me to keep an eye out and ping you the moment something real lands?",
        competitor: "good you've got an agent, that matters a lot, what's the one thing you wish they were doing differently?",
        trust: "it's a big move, so it's fair to be careful, want me to send a couple of recent closes near you so you can see how it actually played out?",
        info: "happy to send something over, what matters more to you right now, the numbers or the neighborhoods?",
      },
    },
  },
  {
    id: "mortgage",
    label: "Mortgage & Lending",
    blurb: "Loan officers — applications, underwriting and funding.",
    terminology: { contact: "Borrower", opportunity: "Loan", value: "Loan Amount" },
    recall: { goingColdDays: 7, stalledDays: 14, noActivityDays: 4, lostWindowDays: 120 },
    currency: "USD",
    pipeline: {
      id: "mortgage_default",
      label: "Loan Pipeline",
      stages: stages([
        ["inquiry", "Inquiry", 0.1],
        ["application", "Application", 0.3],
        ["processing", "Processing", 0.5],
        ["underwriting", "Underwriting", 0.7],
        ["approved", "Approved", 0.85],
        ["funded", "Funded", 1, "won"],
        ["denied", "Denied / Withdrawn", 0, "lost"],
      ]),
    },
    fields: [
      { key: "loanType", label: "Loan Type", type: "select", options: ["Purchase", "Refinance", "HELOC", "Cash-Out"] },
      { key: "creditScore", label: "Credit Score", type: "number" },
      { key: "ltv", label: "LTV %", type: "number" },
    ],
    playbook: {
      buyerGoal: "get approved and funded at the best rate, with no surprises along the way",
      repRole: "their loan officer, who locks the rate, clears conditions, and gets them to funding",
      objections: ["rates are too high right now", "still shopping lenders", "waiting on my credit to come up", "not sure I'll qualify", "the fees look high"],
      nextSteps: {
        email: ["want me to re-run your numbers at today's rates?", "happy to get you pre-approved so you're ready to move", "should I refresh your quote before it expires?"],
        sms: ["rates dipped this week — want me to re-run your numbers?", "free for 10 min to lock this in?", "want me to refresh your quote before it expires?"],
        call: ["Re-run the scenario at today's rate; lead with the monthly payment.", "Ask what's holding them back — rate, fees, or timing.", "Walk through what you need to get them pre-approved fast."],
      },
      reengage: ["your rate quote from last month is about to expire", "rates moved since we last talked — worth another look", "wanted to catch you before your pre-approval lapses"],
      sampleVoice: [
        "hey marcus — rates ticked down this week. want me to re-run your refi? takes me 10 min and could save you real money.",
        "quick one: your pre-approval expires friday. want me to refresh it so you don't lose your spot?",
      ],
      vocabulary: ["rate lock", "pre-approval", "refi", "closing costs", "underwriting", "APR", "conditions", "funding"],
      objectionAngles: {
        price: "rate and fees are the whole game here, so what rate were you quoted, and I'll tell you straight if I can beat it?",
        timing: "rates move on their own schedule, so want me to keep watch and only ping you if they dip into your range?",
        competitor: "good you're working with someone, are they actually locking your rate or still leaving it floating?",
        trust: "money this big, it's smart to be careful, want me to run your exact scenario so you see real numbers and not a pitch?",
        info: "can do, are you more focused on the monthly payment or the cash you'd need to close?",
      },
    },
  },
  {
    id: "insurance",
    label: "Insurance",
    blurb: "Agencies — quotes, policies and renewals.",
    terminology: { contact: "Prospect", opportunity: "Policy", value: "Annual Premium" },
    recall: { goingColdDays: 21, stalledDays: 45, lostWindowDays: 270 },
    currency: "USD",
    pipeline: {
      id: "insurance_default",
      label: "Policy Pipeline",
      stages: stages([
        ["lead", "Lead", 0.1],
        ["quoted", "Quoted", 0.4],
        ["follow_up", "Follow-Up", 0.5],
        ["bound", "Bound", 0.9],
        ["active", "Active Policy", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "lineOfBusiness", label: "Line of Business", type: "select", options: ["Auto", "Home", "Life", "Commercial", "Health"] },
      { key: "renewalDate", label: "Renewal Date", type: "date" },
    ],
    playbook: {
      buyerGoal: "the right coverage at a fair price — not overpaying, not underinsured",
      repRole: "their agent, who shops the market, explains the coverage, and handles renewals",
      objections: ["happy with my current carrier", "found it cheaper elsewhere", "don't have time to switch", "not sure I need that coverage", "let me think about it"],
      nextSteps: {
        email: ["want me to shop your renewal and see if I can beat it?", "happy to do a quick coverage review — takes about 10 minutes", "should I send over a side-by-side quote?"],
        sms: ["want me to shop your renewal before it auto-renews?", "free for a quick coverage check this week?", "want me to see if I can beat your current rate?"],
        call: ["Lead with their renewal date and what's changed.", "Ask what they pay now and what's actually covered.", "Offer a quick side-by-side so the savings are obvious."],
      },
      reengage: ["your policy renews next month — want me to shop it?", "rates shifted this year; you might be leaving money on the table", "wanted to reach you before your renewal locks in"],
      sampleVoice: [
        "hi dana — your policy renews next month. want me to shop it around so you're not overpaying? no obligation either way.",
        "found a plan with better coverage for less than you're paying now. worth two minutes to look?",
      ],
      vocabulary: ["premium", "coverage", "deductible", "renewal", "carrier", "quote", "policy", "bound"],
      objectionAngles: {
        price: "cheaper premiums usually mean thinner coverage, so what's the thing you'd be gutted to lose if it wasn't covered?",
        timing: "gaps in coverage are the expensive kind, so when's your current policy up for renewal?",
        competitor: "good you're covered, when did someone last actually check your policy for gaps?",
        trust: "claims are where it really counts, and it's fair to ask, want me to walk you through how yours would actually pay out?",
        info: "happy to, are you trying to save on what you've got or close a gap you're worried about?",
      },
    },
  },
  {
    id: "saas",
    label: "SaaS / B2B Software",
    blurb: "Inbound & outbound — trials, demos and subscriptions.",
    terminology: { contact: "Account", opportunity: "Deal", value: "ARR" },
    currency: "USD",
    pipeline: {
      id: "saas_default",
      label: "Revenue Pipeline",
      stages: stages([
        ["mql", "MQL", 0.1],
        ["sql", "SQL", 0.2],
        ["demo", "Demo", 0.4],
        ["trial", "Trial / POC", 0.55],
        ["proposal", "Proposal", 0.7],
        ["negotiation", "Negotiation", 0.85],
        ["won", "Closed Won", 1, "won"],
        ["lost", "Closed Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "seats", label: "Seats", type: "number" },
      { key: "plan", label: "Plan", type: "select", options: ["Starter", "Pro", "Business", "Enterprise"] },
      { key: "useCase", label: "Use Case", type: "text" },
    ],
    playbook: {
      buyerGoal: "solve the problem and prove ROI without a painful rollout or wasted budget",
      repRole: "their point of contact, who scopes the fit, runs the trial, and makes the business case",
      objections: ["no budget this quarter", "need to loop in my team", "already using a competitor", "not the right time", "need to see ROI first"],
      nextSteps: {
        email: ["want me to extend the trial so your team can really test it?", "happy to put together a quick ROI breakdown for finance", "should we get the wider team on a call?"],
        sms: ["did the trial give your team enough to go on?", "free for 15 min to map out rollout?", "want me to loop in your team this week?"],
        call: ["Ask what the trial proved — or didn't.", "Surface the real blocker: budget, buy-in, or priorities.", "Offer to build the business case for their boss."],
      },
      reengage: ["your trial wrapped a while back — did it land with the team?", "did the team settle on a direction?", "wanted to check before we close out your account"],
      sampleVoice: [
        "hey sam — did the trial give your team enough to make the call? happy to extend it or jump on 15 min if there are open questions.",
        "if budget's the holdup, i can put together an ROI breakdown your finance team will actually like. want me to?",
      ],
      vocabulary: ["trial", "POC", "rollout", "seats", "ROI", "stakeholders", "onboarding", "renewal", "ARR"],
      objectionAngles: {
        price: "it should pay for itself or it isn't worth it, so what would it need to save you to be a no-brainer?",
        timing: "bad timing kills good tools, so what'd need to be true for this to be worth it next quarter?",
        competitor: "good you've got something already, where does it fall short when things get busy?",
        trust: "it's fair to want proof, want me to show you a team like yours and what actually changed for them in the first month?",
        info: "can do, what's the one workflow you'd want this to fix first?",
      },
    },
  },
  {
    id: "agency",
    label: "Agency / Services",
    blurb: "Marketing, dev & consulting — scoped projects and retainers.",
    terminology: { contact: "Client", opportunity: "Engagement", value: "Contract Value" },
    currency: "USD",
    pipeline: {
      id: "agency_default",
      label: "New Business",
      stages: stages([
        ["lead", "Lead", 0.1],
        ["discovery", "Discovery Call", 0.3],
        ["proposal", "Proposal Sent", 0.5],
        ["negotiation", "Negotiation", 0.75],
        ["won", "Won", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "service", label: "Service", type: "text" },
      { key: "engagement", label: "Engagement Type", type: "select", options: ["Project", "Retainer", "Hourly"] },
    ],
    playbook: {
      buyerGoal: "get the project done well, on budget, by someone they trust",
      repRole: "their partner, who scopes the work, sets expectations, and delivers",
      objections: ["budget's tight right now", "thinking about doing it in-house", "comparing a few agencies", "timing's off", "need to see examples first"],
      nextSteps: {
        email: ["want me to tighten the scope to fit your budget?", "happy to send a couple of relevant case studies", "should we get on a quick call to map phase one?"],
        sms: ["still thinking about the project? happy to adjust scope if budget's the holdup", "free for a quick call this week?", "want me to send over a couple of examples?"],
        call: ["Ask where the project sits on their priority list.", "If budget's the issue, offer a phased scope.", "Share one real result you got for a similar client."],
      },
      reengage: ["wanted to see if the project's still on your radar", "any movement on the timeline for this?", "happy to revisit the scope if things have changed"],
      sampleVoice: [
        "hi priya — still thinking about the website? if budget's the holdup, i can phase it so you start smaller and scale up.",
        "no rush at all — just let me know if this is still live or if i should park it for now.",
      ],
      vocabulary: ["scope", "retainer", "deliverables", "phase", "kickoff", "statement of work", "milestone"],
      objectionAngles: {
        price: "you're paying for results, not hours, so what would a real win need to look like to make it worth it?",
        timing: "no rush at all, want me to check back when your next campaign's on the horizon?",
        competitor: "good you've got a team, what's the gap they haven't quite managed to close for you?",
        trust: "agencies overpromise, so it's fair to be wary, want to see real numbers from a client in your space?",
        info: "happy to, is the priority more leads, or better ones that'll actually close?",
      },
    },
  },
  {
    id: "auto",
    label: "Automotive",
    blurb: "Dealerships — test drives, trade-ins and deliveries.",
    terminology: { contact: "Shopper", opportunity: "Sale", value: "Vehicle Price" },
    recall: { goingColdDays: 5, stalledDays: 10, noActivityDays: 3, lostWindowDays: 60 },
    currency: "USD",
    pipeline: {
      id: "auto_default",
      label: "Showroom Pipeline",
      stages: stages([
        ["lead", "Lead", 0.1],
        ["appointment", "Appointment Set", 0.3],
        ["test_drive", "Test Drive", 0.5],
        ["financing", "Financing", 0.75],
        ["delivered", "Delivered", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "vehicle", label: "Vehicle of Interest", type: "text" },
      { key: "tradeIn", label: "Has Trade-In", type: "select", options: ["Yes", "No"] },
      { key: "financing", label: "Financing", type: "select", options: ["Cash", "Finance", "Lease"] },
    ],
    playbook: {
      buyerGoal: "get into the right vehicle at a fair price, with a payment that works",
      repRole: "their salesperson, who finds the right vehicle, sorts financing, and gets them driving",
      objections: ["still shopping around", "payment's too high", "waiting on my trade-in value", "want to think it over", "found one cheaper"],
      nextSteps: {
        email: ["want me to hold the one you liked for you?", "happy to run a few payment options with your trade-in", "should I get you behind the wheel this weekend?"],
        sms: ["the one you liked is still here but moving — want me to hold it?", "free to come take it for a spin this week?", "want me to run your numbers with the trade-in?"],
        call: ["Confirm the vehicle and the payment they're targeting.", "Mention current inventory and any new incentives.", "Offer to hold it and set a test-drive time."],
      },
      reengage: ["the one you drove is still on the lot — for now", "new incentives dropped this month, worth another look", "did you end up finding something, or still looking?"],
      sampleVoice: [
        "hey chris — that tacoma you drove is still here but it's moving fast. want me to hold it til the weekend?",
        "good news — incentives changed this month and your payment just dropped. want the new numbers?",
      ],
      vocabulary: ["test drive", "trade-in", "financing", "incentives", "lot", "payment", "down payment", "delivery"],
      objectionAngles: {
        price: "the sticker's never the real number once we factor everything in, so what monthly payment were you trying to land near?",
        timing: "the right one tends to move fast, want me to hold it and I'll text you if someone else starts circling?",
        competitor: "good you're shopping around, what's the best offer you've got so I know what I'm up against?",
        trust: "it's fair to be cautious, want me to send the full history and the real numbers up front so there's no surprises?",
        info: "can do, are you set on this model, or open to one that'd fit the budget better?",
      },
    },
  },
  {
    id: "home_services",
    label: "Home Services",
    blurb: "HVAC, roofing, solar & remodeling — estimates to installs.",
    terminology: { contact: "Homeowner", opportunity: "Job", value: "Job Value" },
    recall: { goingColdDays: 4, stalledDays: 8, noActivityDays: 2, lostWindowDays: 45 },
    currency: "USD",
    pipeline: {
      id: "home_services_default",
      label: "Jobs Pipeline",
      stages: stages([
        ["lead", "Lead", 0.1],
        ["estimate", "Estimate Scheduled", 0.3],
        ["quoted", "Quote Sent", 0.5],
        ["approved", "Approved", 0.8],
        ["completed", "Completed", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "jobType", label: "Job Type", type: "text" },
      { key: "urgency", label: "Urgency", type: "select", options: ["Emergency", "This Week", "This Month", "Planning"] },
    ],
    playbook: {
      buyerGoal: "get the job done right by someone reliable, at a fair price, without the runaround",
      repRole: "their contact, who gets a tech out, quotes the job, and gets it on the schedule",
      objections: ["getting a couple other quotes", "it's more than I expected", "going to wait on it", "not urgent yet", "might just do it myself"],
      nextSteps: {
        email: ["want me to get a tech out this week to take a look?", "happy to walk through the quote line by line", "should I get you on the schedule before we book up?"],
        sms: ["want me to send a tech out this week to take a look?", "still want that estimate? can get someone out fast", "want me to hold a spot on the schedule?"],
        call: ["Confirm the job and how soon they need it done.", "If price is the snag, walk the quote and the options.", "Offer the next open appointment."],
      },
      reengage: ["did you still want us out to take a look before the season hits?", "your estimate's still good — want to move forward?", "wanted to reach you before our schedule fills up"],
      sampleVoice: [
        "hi pat — did you still want us out to look at the roof before winter? can get a tech there this week.",
        "your quote's still good through the month. want me to lock in a spot before we book up?",
      ],
      vocabulary: ["estimate", "quote", "tech", "job", "install", "scheduled", "site visit", "warranty"],
      objectionAngles: {
        price: "cheap work tends to get done twice, so what's the budget you're hoping to stay under and I'll scope it right?",
        timing: "small issues get pricey fast, want me to swing by for a quick look before it's a bigger job?",
        competitor: "good you've got someone, did they actually stand behind the work they did?",
        trust: "it's fair to be careful about who you let in, want me to send reviews from your street and a written quote?",
        info: "happy to, what's the main thing you'd want sorted first?",
      },
    },
  },
  {
    id: "generic",
    label: "Generic / Other",
    blurb: "A clean, universal pipeline for any business.",
    terminology: { contact: "Contact", opportunity: "Deal", value: "Value" },
    currency: "USD",
    pipeline: {
      id: "generic_default",
      label: "Sales Pipeline",
      stages: stages([
        ["new", "New", 0.1],
        ["qualified", "Qualified", 0.3],
        ["proposal", "Proposal", 0.6],
        ["negotiation", "Negotiation", 0.8],
        ["won", "Won", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [],
    playbook: {
      buyerGoal: "solve their problem with someone they trust, at a fair price",
      repRole: "their point of contact, who answers questions and helps them decide",
      objections: ["still comparing options", "budget's tight", "need to think it over", "not the right time", "looping in someone else"],
      nextSteps: {
        email: ["want to grab 15 minutes this week?", "happy to answer any open questions", "should I send over the details?"],
        sms: ["free for a quick call this week?", "any questions I can help with?", "want me to send the details over?"],
        call: ["Reconfirm what they're trying to solve.", "Surface the real blocker.", "Propose one concrete next step with a date."],
      },
      reengage: ["wanted to see if this is still on your radar", "anything change on your end since we last talked?", "happy to pick this back up whenever the timing's right"],
      sampleVoice: [
        "hey — still worth a conversation, or has this dropped off your list? either way, just let me know.",
        "happy to help whenever you're ready, no pressure at all. want me to send over the details?",
      ],
      vocabulary: ["next step", "follow up", "proposal", "timeline", "decision"],
      objectionAngles: {
        price: "it scales to what you actually need, so what's the budget you're working with?",
        timing: "no rush at all, when's realistically a better time to pick this back up?",
        competitor: "good you've got something already, what's the one thing it isn't quite doing for you?",
        trust: "it's fair to be skeptical, want me to send one real example from someone in your exact spot?",
        info: "what matters most to you here, so I send the right thing and not a brochure?",
      },
    },
  },
];

export function getIndustry(id: string): IndustryTemplate {
  return INDUSTRIES.find((i) => i.id === id) ?? INDUSTRIES[INDUSTRIES.length - 1];
}

/** True when `id` is a known industry template (for validating user input). */
export function isIndustryId(id: string): boolean {
  return INDUSTRIES.some((i) => i.id === id);
}

export function getPlaybook(id: string): IndustryPlaybook {
  return getIndustry(id).playbook;
}
