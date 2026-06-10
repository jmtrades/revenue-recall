"use server";

import { revalidatePath } from "next/cache";
import { hasRole } from "@/lib/authz";
import { isAuthRequired } from "@/lib/config";
import { loadSampleData } from "@/lib/sample-data";

export interface SampleDataResult {
  ok: boolean;
  error?: string;
}

/** First-run "explore with sample data" — same permission bar as other
 *  workspace-shaping actions (owner/admin once auth is live). */
export async function loadSampleDataAction(): Promise<SampleDataResult> {
  if (isAuthRequired() && !(await hasRole("owner", "admin"))) {
    return { ok: false, error: "Only an owner or admin can load sample data." };
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
