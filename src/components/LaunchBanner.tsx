import Link from "next/link";
import { launchStatus } from "@/lib/launch";
import { isOperator } from "@/lib/operator";
import { isAuthRequired } from "@/lib/config";
import { DismissibleBanner } from "@/components/DismissibleBanner";

/**
 * Proactive "finish setup" banner shown across the app when something still
 * needs wiring (no sending channel, missing service-role key, etc.) — so the
 * owner is told what's left instead of discovering it buried in Settings or, in
 * the worst case, when a customer hits it. Reads the same launchStatus() as
 * /api/health (one source of truth). Only the people who can fix it (owner/admin,
 * or anyone in the open demo) see it; self-hides once everything's configured.
 */
export async function LaunchBanner() {
  // These are deployment-level config (env vars, domain auth, API keys) only the
  // operator can fix, and the "Finish setup" CTA lands on the operator-only Setup
  // tab — so show it to the operator (or the open demo), never to tenant
  // owners/reps who'd just hit a dead link. Matches the Setup-tab gate.
  if (isAuthRequired() && !(await isOperator())) return null;

  const { blockers, warnings } = launchStatus();
  const urgent = blockers.length > 0;
  const top = blockers[0] ?? warnings[0];
  if (!top) return null; // fully configured → nothing to show

  const extra = blockers.length + warnings.length - 1;

  const inner = (
    <>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{urgent ? "Finish setup: " : "Almost there: "}</span>
        {top}
        {extra > 0 ? ` (+${extra} more)` : ""}
      </span>
      <Link
        href="/settings?tab=setup"
        className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium text-white transition ${urgent ? "bg-danger hover:bg-danger/90" : "bg-warn hover:bg-warn/90"}`}
      >
        Finish setup
      </Link>
    </>
  );

  // A launch blocker (urgent) stays until fixed; a soft "almost there" warning is
  // dismissible for the session. Content-keyed, so a new/different issue re-appears.
  if (urgent) {
    return <div className="flex items-center gap-3 bg-danger/15 px-4 py-2 text-sm text-danger sm:px-8">{inner}</div>;
  }
  return <DismissibleBanner id={`launch:${top}`} className="bg-warn/15 text-warn">{inner}</DismissibleBanner>;
}
