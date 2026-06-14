import { hourInZone } from "@/lib/tz";

/**
 * Prospect-local calling hours, inferred from the phone number. The org-level
 * quiet hours (guardrails.ts) run on the ORG's clock — fine for email, wrong
 * for phones: a New York org dialing at 8:30am hits a San Francisco prospect
 * at 5:30am. US telemarketing rules (TCPA) put the callable window at
 * 8am–9pm in the PROSPECT's local time, so the autonomous dialer enforces it
 * from the number itself.
 *
 * The mapping is NANP area code → dominant IANA zone. A handful of area codes
 * straddle a line (e.g. FL's 850); each is assigned its majority side, which
 * at worst shifts a 13-hour window by one hour — while still catching the
 * call-at-dawn case the org clock can't see. Unknown/toll-free/non-NANP
 * numbers return null and FAIL OPEN (org quiet hours still apply): an
 * international prospect must not make the dialer refuse to work.
 */

// Dominant zone per area code, grouped by zone to stay reviewable.
const ZONES: Record<string, string> = {};
const zone = (tz: string, codes: string) => {
  for (const c of codes.split(" ")) ZONES[c] = tz;
};

// US Eastern + Canada Eastern (Ontario/Quebec).
zone(
  "America/New_York",
  "201 202 203 207 212 215 216 220 223 229 231 234 239 240 248 267 269 272 276 301 302 304 305 313 315 317 321 326 330 332 336 339 347 351 352 380 386 401 404 407 410 412 413 419 423 434 440 443 445 463 470 475 478 484 502 508 513 516 517 518 540 551 561 567 570 571 585 586 603 606 607 609 610 614 616 617 631 646 656 667 678 680 681 689 703 704 706 716 717 718 724 727 732 734 740 743 754 757 762 765 770 772 774 781 786 802 803 804 813 814 828 838 839 843 845 848 854 856 859 860 862 863 864 865 878 904 906 908 910 912 914 917 919 929 934 937 941 947 954 959 973 978 980 984 " +
    "226 249 289 343 365 416 437 438 450 514 519 548 579 581 613 647 705 819 873 905",
);
// US Central + Canada (Manitoba).
zone(
  "America/Chicago",
  "205 210 214 217 218 224 225 228 251 254 256 262 270 281 309 312 314 316 318 319 320 331 334 337 346 361 364 402 405 409 414 417 430 432 469 479 501 504 507 512 515 531 534 539 563 573 580 601 605 608 612 615 618 620 629 630 636 641 651 660 662 682 701 708 712 713 715 726 731 737 763 769 773 779 785 806 815 816 817 830 832 847 850 870 872 901 903 913 918 920 930 931 936 938 940 945 952 956 972 979 985 " +
    "204 431",
);
// Saskatchewan keeps standard time year-round.
zone("America/Regina", "306 639");
// US Mountain + Canada (Alberta).
zone("America/Denver", "303 307 385 406 435 505 575 719 720 801 915 970 983 " + "403 587 780 825");
// Arizona (no DST).
zone("America/Phoenix", "480 520 602 623 928");
// US Pacific + Canada (BC) + Nevada.
zone(
  "America/Los_Angeles",
  "206 209 213 253 279 310 323 341 360 408 415 424 425 442 458 503 509 510 530 541 559 562 564 619 626 628 650 657 661 669 702 707 714 725 747 760 775 805 818 820 831 840 858 909 916 925 949 951 971 " +
    "236 250 604 672 778",
);
zone("America/Anchorage", "907");
zone("Pacific/Honolulu", "808");
// Atlantic (no DST in PR/USVI): Puerto Rico + US Virgin Islands.
zone("America/Puerto_Rico", "787 939 340");
// Atlantic Canada + Newfoundland.
zone("America/Halifax", "506 782 902");
zone("America/St_Johns", "709");

/** The prospect's IANA timezone from their number, or null when it can't be
 *  known (non-NANP, toll-free, unrecognized area code). */
export function timezoneForPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  let area: string | null = null;
  if (digits.length === 11 && digits.startsWith("1")) area = digits.slice(1, 4);
  else if (digits.length === 10 && !phone.trim().startsWith("+")) area = digits.slice(0, 3);
  // Anything else (other country codes, short/garbled) → unknown.
  return area ? ZONES[area] ?? null : null;
}

/** TCPA telemarketing window: callable 8am–9pm in the prospect's local time. */
export const COURTESY_START_HOUR = 8;
export const COURTESY_END_HOUR = 21;

/** The prospect's local hour (0–23), or null when their zone is unknown. */
export function prospectLocalHour(phone: string | null | undefined, now: Date = new Date()): number | null {
  const tz = timezoneForPhone(phone);
  return tz ? hourInZone(now, tz) : null;
}

/** True ONLY when we know the prospect's zone and it's before 8am / after 9pm
 *  there. Unknown zones fail open — the org-clock quiet hours still apply. */
export function outsideCourtesyWindow(phone: string | null | undefined, now: Date = new Date()): boolean {
  const h = prospectLocalHour(phone, now);
  return h !== null && (h < COURTESY_START_HOUR || h >= COURTESY_END_HOUR);
}

export interface CourtesyDecision {
  allowed: boolean;
  /** Whose clock decided: the prospect's inferred zone, the org's zone, or UTC. */
  basis: "prospect" | "org" | "utc";
  /** Hour-of-day (0–23) on that clock — for "it's 6am for them" error messages. */
  hour: number;
}

/**
 * Hard gate for placing a call or text RIGHT NOW (TCPA 8am–9pm). Prefers the
 * prospect's zone inferred from their area code; when the zone can't be known
 * (non-NANP, toll-free, VoIP) it falls back to the ORG's timezone, then UTC —
 * it never fails open. Every dial/send path that contacts a phone should gate
 * on this, including the manual dialer (TCPA applies to human-pressed buttons
 * exactly as much as to autopilot).
 */
export function courtesyCallDecision(phone: string | null | undefined, orgTimezone?: string | null, now: Date = new Date()): CourtesyDecision {
  const prospectHour = prospectLocalHour(phone, now);
  if (prospectHour !== null) {
    return { allowed: prospectHour >= COURTESY_START_HOUR && prospectHour < COURTESY_END_HOUR, basis: "prospect", hour: prospectHour };
  }
  const hour = hourInZone(now, orgTimezone ?? undefined);
  return { allowed: hour >= COURTESY_START_HOUR && hour < COURTESY_END_HOUR, basis: orgTimezone ? "org" : "utc", hour };
}

/** Display payload for the dialer: the prospect's wall-clock time and whether
 *  it's a courteous moment to call. Null when their zone is unknown. */
export function prospectLocalTime(phone: string | null | undefined, now: Date = new Date()): { label: string; hour: number; warn: boolean } | null {
  const tz = timezoneForPhone(phone);
  if (!tz) return null;
  const hour = hourInZone(now, tz);
  let label: string;
  try {
    label = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(now);
  } catch {
    return null;
  }
  return { label, hour, warn: hour < COURTESY_START_HOUR || hour >= COURTESY_END_HOUR };
}
