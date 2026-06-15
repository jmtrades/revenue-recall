import { getSessionUser } from "@/lib/auth";

/**
 * The operator(s) who run this deployment — the owner of the product, as opposed
 * to its customers. Two consequences flow from this: only the operator can load
 * demo sample data (it must never reach a real customer workspace), and the
 * operator is always fully entitled to their own product (you shouldn't be locked
 * out of live AI by your own billing enforcement).
 *
 * Configured via SAMPLE_DATA_EMAILS (comma list) → OPERATOR_EMAIL → the founder's
 * address. Kept here as the single source of truth so the sample-data gate and
 * the entitlement bypass can't drift apart.
 */
const OPERATOR_DEFAULT_EMAIL = "jmtrades1990@gmail.com";

export function operatorEmails(): string[] {
  const raw = process.env.SAMPLE_DATA_EMAILS || process.env.OPERATOR_EMAIL || OPERATOR_DEFAULT_EMAIL;
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** True when the signed-in user is an operator/owner of this deployment. */
export async function isOperator(): Promise<boolean> {
  const user = await getSessionUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  return !!email && operatorEmails().includes(email);
}
