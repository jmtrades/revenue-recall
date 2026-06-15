import { hasRole } from "@/lib/authz";
import { isAuthRequired } from "@/lib/config";

/**
 * Who may see (and fix) a voice-feature diagnostic. Owners/admins can change the
 * env/keys; in the open demo (no auth) anyone can. Reps get nothing — a missing
 * voice should never nag someone who can't do anything about it. Shared by every
 * voice route (library, shared, convai) so the policy lives in one place.
 */
export async function voiceCanFix(): Promise<boolean> {
  return !isAuthRequired() || (await hasRole("owner", "admin"));
}
