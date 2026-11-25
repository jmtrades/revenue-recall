/**
 * One naming scheme for every Meta, Google, and YouTube ad that points here.
 * The builder only assembles a URL. It does not create campaigns in an ad account.
 */

export const UTM_CONVENTION = [
  { field: "utm_source", rule: "meta, google, or youtube" },
  { field: "utm_medium", rule: "paid_social, cpc, or video" },
  { field: "utm_campaign", rule: "{offer}-{audience}-{yyyymm} — webinar-coaches-202611" },
  { field: "utm_content", rule: "the ad name — hook-a" },
  { field: "utm_term", rule: "the search keyword, only on Google search" },
] as const;

export interface LinkInput {
  origin: string;
  path?: string;
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
}

export function buildTrackedUrl(input: LinkInput): string {
  const origin = input.origin.replace(/\/$/, "");
  const path = input.path && input.path.startsWith("/") ? input.path : `/${input.path || ""}`;
  const url = new URL(path || "/", origin || "https://revenue-recall-relaunch.onrender.com");
  const set = (key: string, value: string | undefined) => {
    const v = (value ?? "").trim();
    if (v) url.searchParams.set(key, v);
  };
  set("utm_source", input.source);
  set("utm_medium", input.medium);
  set("utm_campaign", input.campaign);
  set("utm_content", input.content);
  set("utm_term", input.term);
  return url.toString();
}
