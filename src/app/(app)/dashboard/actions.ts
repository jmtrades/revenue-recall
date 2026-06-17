"use server";

import { revalidatePath } from "next/cache";
import { hasRole } from "@/lib/authz";
import { isAuthRequired } from "@/lib/config";
import { loadSampleData, canUseSampleData, removeSampleData } from "@/lib/sample-data";

export interface SampleDataResult {
  ok: boolean;
  error?: string;
}

/** First-run "explore with sample data" — owner/admin only, and only on the
 *  operator's own account (demo data must never enter a real customer's
 *  workspace). */
export async function loadSampleDataAction(): Promise<SampleDataResult> {
  if (isAuthRequired() && !(await hasRole("owner", "admin"))) {
    return { ok: false, error: "Only an owner or admin can load sample data." };
  }
  if (!(await canUseSampleData())) {
    return { ok: false, error: "Sample data isn't available on this account." };
  }
  try {
    await loadSampleData();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't load sample data — try again." };
  }
  // The whole interior is derived from this data — refresh it everywhere.
  for (const p of ["/dashboard", "/recall", "/pipeline", "/leads", "/reports", "/forecast", "/tasks"]) revalidatePath(p);
  return { ok: true };
}

/** Wipe every demo record so the workspace shows only real, live data. Owner/
 *  admin only. Safe — deletes only sample-tagged contacts and their deals. */
export async function removeSampleDataAction(): Promise<SampleDataResult> {
  if (isAuthRequired() && !(await hasRole("owner", "admin"))) {
    return { ok: false, error: "Only an owner or admin can remove sample data." };
  }
  try {
    await removeSampleData();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove sample data — try again." };
  }
  for (const p of ["/dashboard", "/recall", "/pipeline", "/leads", "/reports", "/forecast", "/tasks", "/launch"]) revalidatePath(p);
  return { ok: true };
}
