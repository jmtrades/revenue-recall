import { getIndustry } from "@/lib/industries";

/**
 * Marketing catalog of industries. Each maps to one of the base industry
 * templates (for terminology / pipeline), so we can generate a tailored landing
 * page per industry at near-zero cost. The product itself adapts to ANY
 * industry via the AI onboarding + generic template — this catalog just gives
 * the most common ones a native, SEO-indexed front door.
 */
export interface CatalogEntry {
  slug: string;
  name: string;
  base: string; // an IndustryTemplate id
  tagline?: string;
}

export const INDUSTRY_CATALOG: CatalogEntry[] = [
  { slug: "real-estate", name: "Real Estate", base: "real_estate", tagline: "Turn cold listings and quiet buyers back into closings." },
  { slug: "mortgage", name: "Mortgage & Lending", base: "mortgage", tagline: "Recover stalled refis and purchase leads before they rate-shop away." },
  { slug: "insurance", name: "Insurance", base: "insurance", tagline: "Win back lapsed quotes and renewals on autopilot." },
  { slug: "saas", name: "SaaS & Software", base: "saas", tagline: "Reactivate trials and stalled pipeline that went dark." },
  { slug: "marketing-agency", name: "Marketing Agencies", base: "agency", tagline: "Re-engage proposals that ghosted and retainers about to churn." },
  { slug: "automotive", name: "Auto Dealerships", base: "auto", tagline: "Bring test-drivers and expiring leases back to the lot." },
  { slug: "home-services", name: "Home Services", base: "home_services", tagline: "Close the quotes you sent that never got a yes." },
  { slug: "roofing", name: "Roofing", base: "home_services" },
  { slug: "hvac", name: "HVAC", base: "home_services" },
  { slug: "plumbing", name: "Plumbing", base: "home_services" },
  { slug: "solar", name: "Solar", base: "home_services" },
  { slug: "construction", name: "Construction & Contracting", base: "home_services" },
  { slug: "landscaping", name: "Landscaping", base: "home_services" },
  { slug: "pest-control", name: "Pest Control", base: "home_services" },
  { slug: "security-systems", name: "Security Systems", base: "home_services" },
  { slug: "moving-storage", name: "Moving & Storage", base: "home_services" },
  { slug: "cleaning", name: "Cleaning Services", base: "home_services" },
  { slug: "pool-spa", name: "Pool & Spa Service", base: "home_services" },
  { slug: "windows-doors", name: "Windows & Doors", base: "home_services" },
  { slug: "flooring", name: "Flooring", base: "home_services" },
  { slug: "dental", name: "Dental Practices", base: "generic", tagline: "Fill the chair — recover unscheduled treatment and lapsed patients." },
  { slug: "healthcare", name: "Healthcare & Clinics", base: "generic" },
  { slug: "med-spa", name: "Med Spa & Aesthetics", base: "generic" },
  { slug: "chiropractic", name: "Chiropractic", base: "generic" },
  { slug: "dental-labs", name: "Dental & Medical Labs", base: "generic" },
  { slug: "fitness", name: "Gyms & Fitness", base: "generic", tagline: "Win back trial members and no-shows." },
  { slug: "financial-advisory", name: "Financial Advisory", base: "insurance" },
  { slug: "wealth-management", name: "Wealth Management", base: "insurance" },
  { slug: "accounting", name: "Accounting & Bookkeeping", base: "agency" },
  { slug: "legal", name: "Law Firms", base: "agency", tagline: "Re-engage consultations that never retained." },
  { slug: "recruiting", name: "Recruiting & Staffing", base: "agency", tagline: "Keep candidates and clients warm through every placement." },
  { slug: "consulting", name: "Consulting", base: "agency" },
  { slug: "it-msp", name: "IT Services & MSPs", base: "agency" },
  { slug: "web-design", name: "Web & Design Studios", base: "agency" },
  { slug: "pr", name: "PR & Communications", base: "agency" },
  { slug: "coaching", name: "Coaching & Courses", base: "agency" },
  { slug: "photography", name: "Photography & Video", base: "agency" },
  { slug: "ecommerce", name: "E-commerce & DTC", base: "saas", tagline: "Recover abandoned carts and wholesale leads that stalled." },
  { slug: "fintech", name: "Fintech", base: "saas" },
  { slug: "telecom", name: "Telecom", base: "saas" },
  { slug: "manufacturing", name: "Manufacturing", base: "generic" },
  { slug: "wholesale", name: "Wholesale & Distribution", base: "generic" },
  { slug: "logistics", name: "Logistics & Freight", base: "generic" },
  { slug: "equipment-rental", name: "Equipment Rental", base: "generic" },
  { slug: "travel", name: "Travel & Hospitality", base: "generic" },
  { slug: "events", name: "Events & Venues", base: "generic" },
  { slug: "catering", name: "Catering", base: "generic" },
  { slug: "education", name: "Education & Tutoring", base: "generic" },
  { slug: "nonprofit", name: "Nonprofit & Fundraising", base: "generic" },
  { slug: "property-management", name: "Property Management", base: "real_estate" },
  { slug: "title-escrow", name: "Title & Escrow", base: "real_estate" },
  { slug: "franchise", name: "Franchise Development", base: "generic" },
  { slug: "b2b-services", name: "B2B Services", base: "agency" },
];

const BY_SLUG = new Map(INDUSTRY_CATALOG.map((e) => [e.slug, e]));

export function getCatalogEntry(slug: string): CatalogEntry | undefined {
  return BY_SLUG.get(slug);
}

/** Terminology (contact/opportunity/value labels) for an entry's base template. */
export function termsFor(entry: CatalogEntry) {
  return getIndustry(entry.base).terminology;
}
