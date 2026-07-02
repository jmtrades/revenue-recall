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
    blurb: "HVAC, plumbing, roofing & repairs — estimates to installs.",
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
    id: "restaurants",
    label: "Restaurants & Hospitality",
    blurb: "Reservations, private dining, events & catering — inquiry to confirmed booking.",
    terminology: { contact: "Guest", opportunity: "Booking", value: "Booking Value" },
    recall: { goingColdDays: 3, stalledDays: 7, noActivityDays: 2, lostWindowDays: 60 },
    currency: "USD",
    pipeline: {
      id: "restaurants_default",
      label: "Bookings Pipeline",
      stages: stages([
        ["inquiry", "New Inquiry", 0.1],
        ["contacted", "Contacted", 0.25],
        ["tasting", "Tour / Tasting", 0.5],
        ["proposal", "Proposal / Hold Sent", 0.7],
        ["confirmed", "Confirmed", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "occasion", label: "Occasion", type: "select", options: ["Birthday", "Anniversary", "Corporate", "Wedding", "Holiday Party", "Other"] },
      { key: "partySize", label: "Party Size", type: "number" },
      { key: "eventDate", label: "Event Date", type: "date" },
      { key: "budget", label: "Budget", type: "currency" },
    ],
    playbook: {
      buyerGoal: "lock in the right space, menu, and date for their occasion — without surprises on the bill",
      repRole: "their event contact, who checks the date, holds the room, and gets the menu and details squared away",
      objections: ["still comparing venues", "it's over our budget", "the date might move", "waiting on the final headcount", "the minimum feels high", "went quiet after the tasting"],
      nextSteps: {
        email: ["want me to put a soft hold on the date while you decide?", "happy to send sample menus for your headcount", "should I set up a quick tasting this week?"],
        sms: ["want me to hold the date for you?", "free to swing by for a quick tasting this week?", "still want the room for that night? happy to hold it"],
        call: ["Confirm the date, headcount, and occasion.", "Offer a tasting or a walk-through of the space.", "Put a soft hold on the room with a decision date."],
      },
      reengage: ["the date you asked about is still open — want me to hold it?", "we just opened bookings for the season and your event came to mind", "your proposal's still good — want me to refresh it for your final headcount?", "went quiet after the tasting — anything I can tweak on the menu?", "a date freed up that fits what you wanted"],
      sampleVoice: [
        "hi maria — the private room is open on the 14th. want me to pencil you in while you finalize numbers?",
        "loved having you in for the tasting! want me to hold the patio for the 20th before weekend bookings fill it?",
      ],
      vocabulary: ["reservation", "private dining", "tasting", "prix fixe", "buyout", "food & beverage minimum", "headcount", "soft hold", "banquet", "catering", "event order", "walk-through", "covers", "service charge"],
      objectionAngles: {
        price: "the minimum flexes with the night and the menu, so what budget are you working with and I'll build it to fit?",
        timing: "dates are the one thing I can't make more of, want me to put a no-pressure hold on yours while you sort the details?",
        competitor: "smart to look around, what did you like there that you haven't seen from us yet?",
        trust: "totally fair, want to come in for a tasting so you can judge the food and the room yourself?",
        info: "happy to send it over, what matters most, menus, pricing, or a look at the space?",
      },
    },
  },
  {
    id: "healthcare",
    label: "Healthcare & Clinics",
    blurb: "Dental, med spa, chiro & clinics — consults booked, plans accepted.",
    terminology: { contact: "Patient", opportunity: "Treatment Plan", value: "Plan Value" },
    recall: { goingColdDays: 7, stalledDays: 14, noActivityDays: 3, lostWindowDays: 180 },
    currency: "USD",
    pipeline: {
      id: "healthcare_default",
      label: "Patient Pipeline",
      stages: stages([
        ["inquiry", "New Inquiry", 0.1],
        ["consult_scheduled", "Consult Scheduled", 0.35],
        ["consult_done", "Consult Completed", 0.55],
        ["plan_presented", "Plan Presented", 0.75],
        ["accepted", "Accepted", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "service", label: "Service Interest", type: "text" },
      { key: "insurance", label: "Insurance", type: "select", options: ["Yes", "No", "Unknown"] },
      { key: "preferredTime", label: "Preferred Time", type: "select", options: ["Morning", "Afternoon", "Evening"] },
    ],
    playbook: {
      buyerGoal: "feel better and look after themselves, with care they trust and costs they understand",
      repRole: "the front office, who finds a time that works, answers cost questions plainly, and keeps their plan moving",
      objections: ["need to check my insurance", "it's a lot of money", "i'll book later", "nervous about the procedure", "need to talk to my spouse"],
      nextSteps: {
        email: ["want me to find you a time this week?", "happy to break down what insurance covers vs. out of pocket", "should I hold Thursday morning for you?"],
        sms: ["want me to grab you a spot this week?", "we had an opening tomorrow — want it?", "happy to check your coverage — want me to?"],
        call: ["Confirm what they're hoping to address.", "Answer cost and coverage questions plainly.", "Offer two specific appointment times."],
      },
      reengage: ["you asked about this a while back — still interested? we have openings this week", "your treatment plan is still on file — want to pick it back up?", "it's been a while since your last visit — want me to find you a convenient time?", "we can split the plan into stages if that helps — want the details?", "a spot opened up this week if the timing's better now"],
      sampleVoice: [
        "hi sam — a thursday 10am opened up. want me to hold it for your consult?",
        "your plan from last month is still good. want me to walk you through the phased option?",
      ],
      vocabulary: ["consult", "treatment plan", "coverage", "out of pocket", "financing", "appointment", "follow-up", "new patient special", "recall", "provider", "front desk", "chart"],
      objectionAngles: {
        price: "most plans can be phased or financed so it fits a monthly number, what would feel comfortable?",
        timing: "these things rarely get easier by waiting, want me to at least get your consult on the books so you have options?",
        competitor: "getting a second opinion is smart, what did they recommend and I'll tell you honestly how we compare?",
        trust: "completely fair, want me to send reviews from patients who had the same thing done?",
        info: "of course, do you want the clinical details or the costs first?",
      },
    },
  },
  {
    id: "fitness",
    label: "Fitness & Wellness",
    blurb: "Gyms & studios — trials, tours and memberships.",
    terminology: { contact: "Member", opportunity: "Membership", value: "Membership Value" },
    recall: { goingColdDays: 3, stalledDays: 7, noActivityDays: 2, lostWindowDays: 90 },
    currency: "USD",
    pipeline: {
      id: "fitness_default",
      label: "Membership Pipeline",
      stages: stages([
        ["lead", "New Lead", 0.1],
        ["trial_booked", "Tour / Trial Booked", 0.35],
        ["visited", "Visited", 0.6],
        ["offer", "Offer Made", 0.8],
        ["joined", "Joined", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "goal", label: "Goal", type: "select", options: ["Lose weight", "Build strength", "Group classes", "Train for event", "General health"] },
      { key: "preferredTime", label: "Preferred Time", type: "select", options: ["Morning", "Lunch", "Evening", "Weekend"] },
    ],
    playbook: {
      buyerGoal: "actually stick with it this time — a place they like going that fits their schedule and budget",
      repRole: "their coach on the front end, who gets them in for a visit, matches them to the right plan, and makes starting easy",
      objections: ["too expensive per month", "no time right now", "i'll start after the holidays", "trying the gym closer to home", "not sure i'll actually use it"],
      nextSteps: {
        email: ["want to come in for a free session this week?", "happy to match you with the right class for your goal", "should I hold the intro rate for you?"],
        sms: ["want me to book you into thursday's class?", "free session this week — want in?", "want me to hold the intro rate?"],
        call: ["Ask what they're training for and what stalled them before.", "Book a first session with a specific coach and time.", "Offer the trial — remove the commitment fear."],
      },
      reengage: ["your trial's still available — want me to set it up this week?", "we run classes in your window now — want the schedule?", "spots at the intro rate are nearly gone — want me to hold one?", "it's been a minute! want a comeback week on us?", "your goal's still the goal — want to build a fresh start around it?"],
      sampleVoice: [
        "hey chris — thursday 6pm has 2 spots. want me to put you in?",
        "your free week is still unclaimed. want to start monday?",
      ],
      vocabulary: ["trial", "class pack", "membership", "onboarding session", "PT", "drop-in", "intro rate", "freeze", "comeback offer", "session", "coach", "waitlist"],
      objectionAngles: {
        price: "there are plans by visit too, so it flexes to how you'd actually use it, what budget works?",
        timing: "there's never a perfect week to start, want to just book one session and see how it feels?",
        competitor: "closer is convenient, the question is whether you'll actually go, what would make this worth the extra five minutes?",
        trust: "fair, the industry earned that, no contracts here, want a free week so the gym has to earn you?",
        info: "sure thing, do you want schedules and pricing, or would a quick tour answer it faster?",
      },
    },
  },
  {
    id: "legal",
    label: "Legal Services",
    blurb: "Law firms — consultations booked, engagements signed.",
    terminology: { contact: "Client", opportunity: "Matter", value: "Case Value" },
    recall: { goingColdDays: 5, stalledDays: 12, noActivityDays: 3, lostWindowDays: 120 },
    currency: "USD",
    pipeline: {
      id: "legal_default",
      label: "Matters Pipeline",
      stages: stages([
        ["inquiry", "New Inquiry", 0.1],
        ["consult_scheduled", "Consult Scheduled", 0.4],
        ["consult_done", "Consult Completed", 0.6],
        ["engagement_sent", "Engagement Sent", 0.8],
        ["signed", "Signed", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "matterType", label: "Matter Type", type: "text" },
      { key: "urgency", label: "Urgency", type: "select", options: ["Urgent", "This Month", "Planning"] },
    ],
    playbook: {
      buyerGoal: "get their situation handled by someone competent, without runaway fees or radio silence",
      repRole: "the firm's intake, who gets them in front of the right attorney fast and keeps the process clear",
      objections: ["checking with another firm", "worried about the fees", "not sure i have a case", "i'll deal with it later", "a friend knows a lawyer"],
      nextSteps: {
        email: ["want me to get you 20 minutes with the attorney this week?", "happy to explain how the fee structure works", "should I send over what to bring to the consult?"],
        sms: ["want me to book your consult this week?", "the attorney has thursday afternoon free — want it?", "any questions before your consult? happy to help"],
        call: ["Understand the situation and its urgency.", "Explain the consult and fee structure plainly.", "Offer two concrete consult times."],
      },
      reengage: ["you reached out about your matter a while back — is it still open?", "deadlines can sneak up on these — want that consult on the books?", "the attorney had a cancellation this week if timing works", "your consultation notes are still on file — want to pick it back up?", "happy to answer the fee questions that were open last time"],
      sampleVoice: [
        "hi dana — the attorney can see you thursday at 2. want me to lock it in?",
        "your matter's still open on our side, and timing can matter here. want to talk this week?",
      ],
      vocabulary: ["consultation", "retainer", "engagement letter", "matter", "intake", "attorney", "filing", "fee agreement", "case review", "paralegal", "hourly vs flat fee", "statute of limitations"],
      objectionAngles: {
        price: "fees follow the scope, and the consult is where we scope it, want to at least know your options before deciding?",
        timing: "legal timelines don't wait, some options expire, want me to check whether any deadlines apply to yours?",
        competitor: "comparing firms is wise, the question that matters is who'd actually work your file day to day, want to hear how we'd answer it?",
        trust: "you should vet us, want a couple of client references and the attorney's track record on matters like yours?",
        info: "happy to, what would help most, the process, the fees, or whether it's worth pursuing?",
      },
    },
  },
  {
    id: "financial",
    label: "Financial Advisory",
    blurb: "Advisors & planners — reviews scheduled, plans engaged.",
    terminology: { contact: "Client", opportunity: "Engagement", value: "Engagement Value" },
    recall: { goingColdDays: 10, stalledDays: 21, lostWindowDays: 365 },
    currency: "USD",
    pipeline: {
      id: "financial_default",
      label: "Advisory Pipeline",
      stages: stages([
        ["lead", "New Lead", 0.1],
        ["discovery", "Discovery Call", 0.35],
        ["review", "Portfolio Review", 0.55],
        ["proposal", "Proposal Presented", 0.75],
        ["engaged", "Engaged", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "goal", label: "Primary Goal", type: "select", options: ["Retirement", "Investing", "Tax planning", "Estate", "Insurance"] },
      { key: "timeline", label: "Timeline", type: "select", options: ["Now", "This Quarter", "This Year", "Exploring"] },
    ],
    playbook: {
      buyerGoal: "feel confident their money is working toward their goals — retirement, family, the next chapter",
      repRole: "their advisor's office, who sets up the review, gathers the pieces, and keeps the plan moving",
      objections: ["already have an advisor", "market feels shaky right now", "want to wait until after tax season", "not enough saved to bother", "worried fees eat returns"],
      nextSteps: {
        email: ["want to grab 30 minutes for a no-pressure review?", "happy to send how our fees work — it's straightforward", "should I send a checklist of what to have handy?"],
        sms: ["free for a quick intro call this week?", "want me to set up that review?", "happy to answer the fee question — quick call?"],
        call: ["Ask what prompted them to look now.", "Understand goals and the current setup at a high level.", "Book the discovery meeting with everyone who decides."],
      },
      reengage: ["you asked about a review a while back — still on your mind?", "life changes fast — worth a fresh look at the plan?", "year-end planning slots are opening — want one?", "your fee questions deserved a better answer — have 15 minutes?", "no pitch — just a check-in on whether your plan still fits"],
      sampleVoice: [
        "hi jordan — happy to do that second look we discussed. thursday or friday work?",
        "year-end planning slots are filling. want me to hold one before the rush?",
      ],
      vocabulary: ["portfolio review", "discovery call", "financial plan", "rebalance", "fee-only", "fiduciary", "rollover", "allocation", "risk tolerance", "year-end planning", "second opinion", "estate"],
      objectionAngles: {
        price: "fees matter, which is why we put ours in writing up front, want to see the actual number for your situation?",
        timing: "planning matters most when things feel uncertain, want a short call just to see where you stand?",
        competitor: "keeping your advisor is fine, a second opinion just checks the blind spots, want a no-obligation review?",
        trust: "you should be skeptical with money, we'll walk through exactly how we're paid and why, would that help?",
        info: "of course, what's the bigger question for you, the timeline or whether the current mix still fits?",
      },
    },
  },
  {
    id: "beauty",
    label: "Salons & Spas",
    blurb: "Hair, nails & aesthetics — chairs filled, clients rebooked.",
    terminology: { contact: "Client", opportunity: "Appointment", value: "Service Value" },
    recall: { goingColdDays: 3, stalledDays: 10, noActivityDays: 2, lostWindowDays: 90 },
    currency: "USD",
    pipeline: {
      id: "beauty_default",
      label: "Appointments Pipeline",
      stages: stages([
        ["inquiry", "New Inquiry", 0.15],
        ["consult", "Consult / Patch Test", 0.4],
        ["booked", "Booked", 0.8],
        ["completed", "Completed", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "service", label: "Service", type: "text" },
      { key: "stylist", label: "Preferred Stylist", type: "text" },
      { key: "preferredTime", label: "Preferred Time", type: "select", options: ["Weekday", "Evening", "Weekend"] },
    ],
    playbook: {
      buyerGoal: "walk out feeling great, from someone they trust with their look, at a time that fits",
      repRole: "the front desk, who matches them with the right stylist, finds the slot, and keeps them coming back",
      objections: ["prices went up", "my usual person left", "i'll book when things calm down", "trying somewhere closer", "couldn't get a weekend slot"],
      nextSteps: {
        email: ["want me to book you with your usual stylist this month?", "a saturday slot opened up — want it?", "should I put you on the cancellation list?"],
        sms: ["sat 2pm just opened — want it?", "time for your refresh? happy to book you in", "want me to save your usual slot?"],
        call: ["Confirm the service and who they like.", "Offer the next best two slots.", "Mention the rebooking perk if they book today."],
      },
      reengage: ["it's been about six weeks — ready for your refresh?", "your stylist has openings this week — want your usual?", "we miss you! here's what's new since your last visit", "your color formula's on file — want me to book a touch-up?", "a saturday cancellation just opened up — first come first served"],
      sampleVoice: [
        "hi lena — it's been six weeks since your color. sam has thursday 4pm — want it?",
        "a saturday 2pm just freed up. want me to grab it for you?",
      ],
      vocabulary: ["appointment", "rebook", "touch-up", "color formula", "stylist", "cancellation list", "walk-in", "consultation", "patch test", "gloss", "balayage", "no-show fee"],
      objectionAngles: {
        price: "quality work holds longer, which usually means fewer visits, want me to price the exact service so there are no surprises?",
        timing: "your spot fills fast, want me to book something a few weeks out so it's there when you're ready?",
        competitor: "closer is easier, but your formula and history live here, want me to send them over or save your chair?",
        trust: "new-chair jitters are real, want a quick consult first so you can meet the stylist before committing?",
        info: "happy to help, is it pricing, timing, or finding the right stylist for what you want?",
      },
    },
  },
  {
    id: "education",
    label: "Education & Coaching",
    blurb: "Courses, coaching & training — seats held, enrollments finished.",
    terminology: { contact: "Student", opportunity: "Enrollment", value: "Tuition" },
    recall: { goingColdDays: 5, stalledDays: 10, noActivityDays: 3, lostWindowDays: 120 },
    currency: "USD",
    pipeline: {
      id: "education_default",
      label: "Enrollment Pipeline",
      stages: stages([
        ["lead", "New Lead", 0.1],
        ["call_booked", "Intro Call Booked", 0.35],
        ["attended", "Attended", 0.55],
        ["offer", "Offer Made", 0.75],
        ["enrolled", "Enrolled", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "program", label: "Program", type: "text" },
      { key: "startDate", label: "Target Start", type: "date" },
      { key: "funding", label: "Funding", type: "select", options: ["Self-pay", "Employer", "Financing"] },
    ],
    playbook: {
      buyerGoal: "actually get the skill or the outcome — not another course they never finish",
      repRole: "admissions, who answers the practical questions, matches them to the right program, and helps them start",
      objections: ["not sure i'll have time", "can i really do this from zero", "the price is steep", "comparing programs", "maybe next cohort"],
      nextSteps: {
        email: ["want 15 minutes to see if the program fits?", "happy to send outcomes from past students", "should I hold a seat in the next cohort?"],
        sms: ["cohort closes friday — want your seat held?", "free for a quick fit call?", "want the syllabus + payment options?"],
        call: ["Ask the outcome they want and the time they truly have.", "Match them to the right program honestly.", "Hold a seat with a decision date."],
      },
      reengage: ["the next cohort opens soon — want your spot?", "you asked great questions last time — did they get answered?", "we added evening sessions since you looked", "your application's half done — want help finishing?", "seats are nearly gone for this start date"],
      sampleVoice: [
        "hi alex — the march cohort has 3 seats left. want me to hold one while you decide?",
        "you mentioned evenings were the issue. we just added a 7pm track — does that change things?",
      ],
      vocabulary: ["cohort", "enrollment", "syllabus", "tuition", "payment plan", "admissions call", "seat", "start date", "curriculum", "certificate", "outcomes", "alumni"],
      objectionAngles: {
        price: "weigh it against what the skill pays back, and there are payment plans, want the monthly number?",
        timing: "the next cohort always feels safer until it's also 'next', what would make this one workable?",
        competitor: "compare finish rates and outcomes, not just price, want ours side by side with theirs?",
        trust: "don't take our word for it, want me to connect you with a grad who started where you are?",
        info: "gladly, what would help you decide, the syllabus, outcomes, or payment options?",
      },
    },
  },
  {
    id: "recruiting",
    label: "Recruiting & Staffing",
    blurb: "Agencies & staffing — candidates placed, reqs filled.",
    terminology: { contact: "Candidate", opportunity: "Placement", value: "Placement Fee" },
    recall: { goingColdDays: 4, stalledDays: 8, noActivityDays: 2, lostWindowDays: 60 },
    currency: "USD",
    pipeline: {
      id: "recruiting_default",
      label: "Placements Pipeline",
      stages: stages([
        ["sourced", "Sourced", 0.1],
        ["screened", "Screened", 0.3],
        ["submitted", "Submitted", 0.5],
        ["interviewing", "Interviewing", 0.7],
        ["offer", "Offer Stage", 0.85],
        ["placed", "Placed", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "role", label: "Role", type: "text" },
      { key: "comp", label: "Target Comp", type: "currency" },
      { key: "availability", label: "Availability", type: "select", options: ["Immediately", "2 weeks", "1 month+"] },
    ],
    playbook: {
      buyerGoal: "land the right role fast — without being ghosted or shopped around",
      repRole: "their recruiter, who brings real opportunities, gives an honest read, and keeps the process moving",
      objections: ["happy where i am", "already talking to other recruiters", "the comp isn't there", "went quiet after the interview", "the hiring manager is slow to decide"],
      nextSteps: {
        email: ["open to hearing the details? no pressure either way", "want me to submit you before the role closes?", "free for 10 minutes to talk comp and fit?"],
        sms: ["new role fits your profile — worth a chat?", "client wants to interview this week — you in?", "quick update on your submission — call me?"],
        call: ["Confirm comp, location, and what would make them move.", "Give an honest read on fit.", "Lock the next interview slot before hanging up."],
      },
      reengage: ["the role you liked reopened — still interested?", "a new search just landed that fits your profile", "checking in — how's the current gig actually going?", "your profile's strong for what's moving this quarter", "that client finally got budget — want back in?"],
      sampleVoice: [
        "hey taylor — new role landed: senior pm, remote, above your last ask. worth 10 minutes?",
        "the client moved fast on your profile. can you interview thursday?",
      ],
      vocabulary: ["submission", "screen", "req", "placement", "comp", "counteroffer", "notice period", "pipeline", "shortlist", "hiring manager", "contract-to-hire", "fee agreement"],
      objectionAngles: {
        price: "comp is set by the market, and i only bring roles worth your time, what's the number that would make a move real?",
        timing: "the best roles never wait for perfect timing, want me to just keep you quietly in the loop?",
        competitor: "work with whoever helps, just don't get double-submitted, want me to tell you exactly where i'd send you first?",
        trust: "recruiters earned the reputation, so i'll tell you the downsides of a role too, want to hear from someone i've placed before you decide?",
        info: "straight answers only, what do you want first, comp, the team, or why the role's open?",
      },
    },
  },
  {
    id: "construction",
    label: "Construction & Remodeling",
    blurb: "Builders & remodelers — bids won, projects signed.",
    terminology: { contact: "Client", opportunity: "Project", value: "Contract Value" },
    recall: { goingColdDays: 7, stalledDays: 18, lostWindowDays: 180 },
    currency: "USD",
    pipeline: {
      id: "construction_default",
      label: "Projects Pipeline",
      stages: stages([
        ["lead", "New Lead", 0.1],
        ["site_visit", "Site Visit", 0.3],
        ["bid", "Bid Submitted", 0.55],
        ["negotiation", "Negotiation", 0.75],
        ["signed", "Signed", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "projectType", label: "Project Type", type: "text" },
      { key: "budget", label: "Budget", type: "currency" },
      { key: "timeline", label: "Timeline", type: "select", options: ["ASAP", "1-3 months", "3-6 months", "Planning"] },
    ],
    playbook: {
      buyerGoal: "get the project built right, on budget, by a crew that shows up",
      repRole: "the estimator, who walks the site, prices it straight, and gets the contract and schedule locked",
      objections: ["the bid came in high", "waiting on financing", "getting three bids", "might scale back the scope", "bad contractor experience before"],
      nextSteps: {
        email: ["want to walk the bid together line by line?", "happy to price the phased version", "should we hold your slot on the schedule?"],
        sms: ["free to talk through the bid this week?", "we can phase it to fit budget — want numbers?", "the schedule's filling — want your slot held?"],
        call: ["Reconfirm scope and the real budget.", "Offer value-engineering options.", "Ask for the decision date and who else weighs in."],
      },
      reengage: ["is the project still moving? happy to refresh the bid", "material prices shifted — your bid may come down", "a crew opened up next month if the timing works", "want the phased option so it starts inside budget?", "permit timelines are a factor — want to talk schedule?"],
      sampleVoice: [
        "hi rob — reworked the numbers with the alternate decking and it comes in well under the original. want the revised bid?",
        "a crew opened up the first week of may. want me to pencil your project in?",
      ],
      vocabulary: ["bid", "scope", "change order", "site visit", "phasing", "permit", "sub", "punch list", "draw schedule", "allowance", "value engineering", "GC"],
      objectionAngles: {
        price: "a bid is scope, not a sticker, we can phase it or value-engineer it, what number does it need to hit?",
        timing: "schedules and permits set the real timeline, want me to hold a slot so waiting doesn't cost you the season?",
        competitor: "make sure the bids cover the same scope, the cheap one usually doesn't, want me to show you what to check?",
        trust: "you've been burned, so ask for our last three clients and go see the work, want their numbers?",
        info: "sure, what would help most, the line items, the timeline, or references?",
      },
    },
  },
  {
    id: "solar",
    label: "Solar & Energy",
    blurb: "Solar & efficiency — surveys to installs, bills made smaller.",
    terminology: { contact: "Homeowner", opportunity: "Install", value: "System Value" },
    recall: { goingColdDays: 5, stalledDays: 10, noActivityDays: 3, lostWindowDays: 120 },
    currency: "USD",
    pipeline: {
      id: "solar_default",
      label: "Installs Pipeline",
      stages: stages([
        ["lead", "New Lead", 0.1],
        ["survey", "Site Survey", 0.35],
        ["proposal", "Proposal Presented", 0.6],
        ["financing", "Financing / Approvals", 0.8],
        ["installed", "Installed", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "monthlyBill", label: "Monthly Bill", type: "currency" },
      { key: "ownership", label: "Ownership", type: "select", options: ["Own", "Rent"] },
      { key: "roofAge", label: "Roof Age", type: "select", options: ["0-10 years", "10-20 years", "20+ years", "Unknown"] },
    ],
    playbook: {
      buyerGoal: "cut the power bill and own their energy — without getting burned by a pushy solar pitch",
      repRole: "their project consultant, who checks the roof and the bill, prices the system straight, and manages the install",
      objections: ["solar companies are pushy", "the roof needs work first", "the payback takes too long", "waiting to see utility rates", "we might move in a few years"],
      nextSteps: {
        email: ["want the numbers run from your actual bill?", "happy to do the site survey this week — it's quick", "should I model the no-money-down option?"],
        sms: ["want your roof's actual numbers? takes one bill", "the survey crew's nearby thursday — want a slot?", "your proposal's ready — 15 minutes to walk it?"],
        call: ["Get the actual monthly bill and roof basics.", "Book the site survey.", "Walk the proposal with every decision-maker present."],
      },
      reengage: ["your proposal's expiring — want it refreshed?", "the install calendar is filling — you were close to a decision", "the incentive you asked about is confirmed — want the updated math?", "still on the old bill? happy to re-run your numbers", "rates changed since we quoted — worth a fresh look"],
      sampleVoice: [
        "hi dev — ran your last bill through the model and the system covers most of it. want the full breakdown?",
        "install slots for june are filling. your proposal's ready when you are.",
      ],
      vocabulary: ["site survey", "proposal", "kWh", "offset", "net metering", "incentive", "financing", "payback", "panel layout", "interconnection", "permit", "install crew"],
      objectionAngles: {
        price: "you already pay a power bill forever, this redirects it into something you own, want the side-by-side from your actual bill?",
        timing: "every month on the old bill is money gone, want the numbers now so you can decide on your own schedule?",
        competitor: "compare the equipment, the warranty, and who actually does the install, want our spec sheet to hold against theirs?",
        trust: "the industry earned the eye-roll, no pressure here, want references from installs near you?",
        info: "happy to, the easiest start is one recent bill, from that i can give you real numbers, want to send it over?",
      },
    },
  },
  {
    id: "travel",
    label: "Travel & Events",
    blurb: "Agencies, venues & planners — inquiries turned into booked dates.",
    terminology: { contact: "Client", opportunity: "Booking", value: "Booking Value" },
    recall: { goingColdDays: 4, stalledDays: 10, noActivityDays: 3, lostWindowDays: 90 },
    currency: "USD",
    pipeline: {
      id: "travel_default",
      label: "Bookings Pipeline",
      stages: stages([
        ["inquiry", "New Inquiry", 0.1],
        ["consult", "Consultation", 0.35],
        ["itinerary", "Itinerary / Proposal", 0.6],
        ["deposit", "Deposit Requested", 0.8],
        ["booked", "Booked", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "destination", label: "Destination / Event", type: "text" },
      { key: "dates", label: "Target Dates", type: "date" },
      { key: "groupSize", label: "Group Size", type: "number" },
      { key: "budget", label: "Budget", type: "currency" },
    ],
    playbook: {
      buyerGoal: "a trip or event that matches the picture in their head — planned without the stress",
      repRole: "their planner, who turns the idea into an itinerary, holds the good options, and handles the details",
      objections: ["just dreaming for now", "prices might drop", "the group can't agree on dates", "we might book it ourselves", "the budget got cut"],
      nextSteps: {
        email: ["want me to hold those dates while the group decides?", "happy to build two options at different budgets", "should I check availability before it goes?"],
        sms: ["rates for your dates are moving — want me to hold?", "got the itinerary draft — want a look?", "a deposit locks the rate — want the link?"],
        call: ["Confirm dates, group size, and the real budget.", "Present the itinerary and the one decision needed now.", "Hold the inventory with a deadline."],
      },
      reengage: ["your dates are coming into booking window — still thinking about it?", "found an option that fits the budget you mentioned", "the venue you liked has your date open again", "group trips book out early — want me to refresh availability?", "your itinerary's still saved — want it re-priced?"],
      sampleVoice: [
        "hi noor — the resort you loved has your week open, and the rate holds through friday. want me to lock it?",
        "re-priced your itinerary and it came down a good chunk. want the update?",
      ],
      vocabulary: ["itinerary", "booking window", "deposit", "hold", "availability", "group rate", "supplier", "confirmation", "final payment", "room block", "transfer", "peak season"],
      objectionAngles: {
        price: "rates move with availability, not wishes, want me to hold today's price while you decide?",
        timing: "the good inventory goes first, a refundable hold costs nothing, want me to place one?",
        competitor: "booking direct works until something goes wrong, we're the ones who fix it at 2am, what's that worth?",
        trust: "fair, want a couple of clients who've traveled with us to tell you themselves?",
        info: "absolutely, what decides it for you, the price, the property, or the dates working for everyone?",
      },
    },
  },
  {
    id: "ecommerce",
    label: "E-commerce & Retail",
    blurb: "Stores & brands — carts recovered, customers reordered.",
    terminology: { contact: "Customer", opportunity: "Order", value: "Order Value" },
    recall: { goingColdDays: 2, stalledDays: 5, noActivityDays: 1, lostWindowDays: 45 },
    currency: "USD",
    pipeline: {
      id: "ecommerce_default",
      label: "Orders Pipeline",
      stages: stages([
        ["interested", "Interested", 0.2],
        ["cart", "Cart / Quote", 0.5],
        ["checkout", "Checkout Started", 0.75],
        ["purchased", "Purchased", 1, "won"],
        ["lost", "Lost", 0, "lost"],
      ]),
    },
    fields: [
      { key: "product", label: "Product Interest", type: "text" },
      { key: "lastOrder", label: "Last Order", type: "date" },
    ],
    playbook: {
      buyerGoal: "get the thing they want at a price that feels right, without regretting it",
      repRole: "the brand's helper, who answers fit and shipping questions and nudges the order over the line",
      objections: ["shipping costs too much", "found it cheaper elsewhere", "not sure about the size", "waiting for a sale", "left it in the cart"],
      nextSteps: {
        email: ["your cart's saved — anything I can answer?", "want the size guide or a fit rec?", "should I apply your welcome code?"],
        sms: ["your cart's about to expire — want me to hold it?", "back in stock in your size — want it?", "your code works today if you're still deciding"],
        call: ["Confirm what held the order up.", "Solve it — fit, shipping, or code — on the spot.", "Place the order together."],
      },
      reengage: ["the item in your cart is almost gone in your size", "you're about due on the refill — same order as last time?", "restocked! your size is back", "here's a code to finish the order you started", "it's been a while — want first look at the new drop?"],
      sampleVoice: [
        "hey — your size in the runner is back in stock, and there aren't many. want me to hold one?",
        "you're about due on the refill. same order as last time?",
      ],
      vocabulary: ["cart", "checkout", "restock", "refill", "SKU", "bundle", "code", "shipping threshold", "returns window", "drop", "back in stock", "loyalty points"],
      objectionAngles: {
        price: "with the bundle or the free-shipping threshold it usually nets out better, want me to do the math on your cart?",
        timing: "no rush, though stock is the one thing i can't promise later, want me to hold your size for a day?",
        competitor: "a lower price without real returns and support isn't lower, want me to match a legitimate offer if you found one?",
        trust: "totally fair for a first order, returns are free inside the window, so the risk is on us, does that help?",
        info: "of course, is it fit, materials, or shipping time you want nailed down first?",
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
