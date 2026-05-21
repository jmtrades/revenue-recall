import type { Pipeline } from "@/lib/crm/types";

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
  },
  {
    id: "mortgage",
    label: "Mortgage & Lending",
    blurb: "Loan officers — applications, underwriting and funding.",
    terminology: { contact: "Borrower", opportunity: "Loan", value: "Loan Amount" },
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
  },
  {
    id: "insurance",
    label: "Insurance",
    blurb: "Agencies — quotes, policies and renewals.",
    terminology: { contact: "Prospect", opportunity: "Policy", value: "Annual Premium" },
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
  },
  {
    id: "auto",
    label: "Automotive",
    blurb: "Dealerships — test drives, trade-ins and deliveries.",
    terminology: { contact: "Shopper", opportunity: "Sale", value: "Vehicle Price" },
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
  },
  {
    id: "home_services",
    label: "Home Services",
    blurb: "HVAC, roofing, solar & remodeling — estimates to installs.",
    terminology: { contact: "Homeowner", opportunity: "Job", value: "Job Value" },
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
  },
];

export function getIndustry(id: string): IndustryTemplate {
  return INDUSTRIES.find((i) => i.id === id) ?? INDUSTRIES[INDUSTRIES.length - 1];
}
